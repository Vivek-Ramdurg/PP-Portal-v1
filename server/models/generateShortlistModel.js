const pool = require("../config/db");

 const GenerateShortlistModel = {
  async getAllStates() {
    console.log("Model: getAllStates - Entered");
    try {
      const result = await pool.query(`
          SELECT juris_code, juris_name
          FROM pp.jurisdiction
          WHERE LOWER(juris_type) = 'state';
        `);
      console.log("Model: getAllStates - Success", result.rows);
      return result.rows;
    } catch (error) {
      console.error("Model: getAllStates - Error:", error);
      throw error;
    }
  },

  async getDistrictsByState(stateName) {
    console.log("Model: getDistrictsByState - Entered", { stateName });
    try {
      const result = await pool.query(
        `
          SELECT juris_code, juris_name
          FROM pp.jurisdiction AS district
          WHERE district.parent_juris IN (
            SELECT state.juris_code
            FROM pp.jurisdiction AS state
            WHERE LOWER(TRIM(state.juris_name)) = LOWER(TRIM($1))
          )
          AND LOWER(district.juris_type) = 'education district';
        `,
        [stateName]
      );
      console.log("Model: getDistrictsByState - Success", result.rows);
      return result.rows;
    } catch (error) {
      console.error("Model: getDistrictsByState - Error:", error);
      throw error;
    }
  },

  async getBlocksByDistrict(districtName) {
    console.log("Model: getBlocksByDistrict - Entered", { districtName });
    try {
      const result = await pool.query(
        `
          SELECT
            j.juris_code,
            j.juris_name,
            CASE
              WHEN j.juris_code IN (
                SELECT sbj.juris_code
                FROM pp.shortlist_batch_jurisdiction AS sbj
                JOIN pp.shortlist_batch AS sb ON sbj.shortlist_batch_id = sb.shortlist_batch_id
                JOIN pp.jurisdiction AS district ON sbj.juris_code = district.juris_code
                WHERE sb.frozen_yn = 'Y'
                  AND district.parent_juris IN (
                    SELECT juris_code
                    FROM pp.jurisdiction
                    WHERE LOWER(TRIM(juris_name)) = LOWER(TRIM($1))
                      AND juris_type = 'EDUCATION DISTRICT'
                  )
              ) THEN TRUE
              ELSE FALSE
            END AS is_frozen_block
          FROM pp.jurisdiction AS j
          WHERE LOWER(j.juris_type) = 'block'
            AND j.parent_juris IN (
              SELECT juris_code
              FROM pp.jurisdiction
              WHERE LOWER(TRIM(juris_name)) = LOWER(TRIM($1))
                AND juris_type = 'EDUCATION DISTRICT'
            );
        `,
        [districtName]
      );
      console.log("Model: getBlocksByDistrict - Fetched blocks from DB:", result.rows, "for district:", districtName);
      return result.rows;
    } catch (error) {
      console.error("Model: getBlocksByDistrict - Error:", error);
      throw error;
    }
  },

  async getCriteria() {
    console.log("Model: getCriteria - Entered");
    try {
      const result = await pool.query(`
          SELECT criteria_id, criteria FROM pp.shortlisting_criteria;
        `);
      console.log("Model: getCriteria - Success", result.rows);
      return result.rows;
    } catch (error) {
      console.error("Model: getCriteria - Error:", error);
      throw error;
    }
  },

  async createShortlistBatch(
    shortlistName,
    description,
    criteriaId,
    selectedBlocks,
    state,
    district,
    year // Ensure 'year' is in the parameter list
  ) {
    console.log("Model: createShortlistBatch - Entered", { shortlistName, description, criteriaId, selectedBlocks, state, district, year });
    let shortlistedCount = 0;
    let shortlistBatchId = null;
    try {
      await pool.query("BEGIN"); // Start transaction
      console.log("Model: createShortlistBatch - Transaction BEGIN");

      // 0. Check for existing shortlists for the selected blocks
      if (selectedBlocks && selectedBlocks.length > 0) {
        const checkExistingQuery = `
          SELECT sb.shortlist_batch_name, block.juris_name
          FROM pp.shortlist_batch_jurisdiction AS sbj
          JOIN pp.jurisdiction AS block ON sbj.juris_code = block.juris_code
          JOIN pp.shortlist_batch AS sb ON sbj.shortlist_batch_id = sb.shortlist_batch_id
          WHERE LOWER(TRIM(block.juris_name)) = ANY($1)
            AND sb.frozen_yn = 'N';
        `;
        const existingShortlists = await pool.query(checkExistingQuery, [
          selectedBlocks.map((b) => b.toLowerCase().trim()),
        ]);

        if (existingShortlists.rows.length > 0) {
          let errorMessage = "Shortlists already exist for the following blocks:\n";
          existingShortlists.rows.forEach(row => {
            errorMessage += `- ${row.juris_name}: ${row.shortlist_batch_name}\n`;
          });
          errorMessage += "Please delete them first if not freezen. Operation aborted.";
          console.error("Model: createShortlistBatch - Error:", errorMessage);
          throw new Error(errorMessage);
        }
      }
      // 1. Insert into shortlist_batch and get the ID
      const insertBatchResult = await pool.query(
        `
          INSERT INTO pp.shortlist_batch (shortlist_batch_name, description, criteria_id)
          VALUES ($1, $2, $3)
          RETURNING shortlist_batch_id;
        `,
        [shortlistName, description, criteriaId]
      );

      shortlistBatchId = insertBatchResult.rows[0].shortlist_batch_id;
      console.log("Model: createShortlistBatch - Inserted into shortlist_batch, ID:", shortlistBatchId);

      // 2. Insert into shortlist_batch_jurisdiction for each selected block
      if (selectedBlocks && selectedBlocks.length > 0) {
        const insertJurisdictionQuery = `
          INSERT INTO pp.shortlist_batch_jurisdiction (shortlist_batch_id, juris_code)
          SELECT $1, juris_code
          FROM pp.jurisdiction
          WHERE LOWER(TRIM(juris_name)) = ANY($2);
        `;

        const blockNamesLowercased = selectedBlocks.map((block) => block.toLowerCase().trim());
        console.log("Model: createShortlistBatch - Inserting into shortlist_batch_jurisdiction", { shortlistBatchId, blockNamesLowercased });
        await pool.query(insertJurisdictionQuery, [
          shortlistBatchId,
          blockNamesLowercased,
        ]);
        console.log("Model: createShortlistBatch - Inserted into shortlist_batch_jurisdiction");

        // 3. Select and insert shortlisted applicants
        let selectApplicantsQuery = "";
        let criteriaName = "";
        const criteriaResult = await pool.query(
          `SELECT criteria FROM pp.shortlisting_criteria WHERE criteria_id = $1`,
          [criteriaId]
        );
        if (criteriaResult.rows.length > 0) {
          criteriaName = criteriaResult.rows[0].criteria;
        } else {
          console.error(`Model: createShortlistBatch - Unsupported criteriaId: ${criteriaId}`);
          throw new Error(`Unsupported criteriaId: ${criteriaId}`);
        }

        if (criteriaName.toLowerCase().includes("top 4%")) {
          selectApplicantsQuery = `
            WITH ApplicantRanked AS (
              SELECT
                applicant_id,
                nmms_year,
                app_state,
                district,
                nmms_block AS block,
                gmat_score,
                sat_score,
                (gmat_score * 0.7 + sat_score * 0.3) AS weighted_score,
                PERCENT_RANK() OVER (ORDER BY (gmat_score * 0.7 + sat_score * 0.3) DESC) AS percentile_rank
              FROM pp.applicant_primary_info
              WHERE nmms_year = $4
            )
            SELECT
              ar.applicant_id
            FROM ApplicantRanked ar
            JOIN pp.jurisdiction state_juris ON ar.app_state = state_juris.juris_code
            JOIN pp.jurisdiction district_juris ON ar.district = district_juris.juris_code
            JOIN pp.jurisdiction block_juris ON ar.block = block_juris.juris_code
            WHERE LOWER(TRIM(state_juris.juris_name)) = LOWER(TRIM($1))
              AND LOWER(TRIM(district_juris.juris_name)) = LOWER(TRIM($2))
              AND LOWER(TRIM(block_juris.juris_name)) = LOWER(TRIM($3))
              AND ar.percentile_rank <= 0.04;
          `;
        } else if (criteriaName.toLowerCase().includes("top 8%")) {
          selectApplicantsQuery = `
            WITH ApplicantRanked AS (
              SELECT
                applicant_id,
                nmms_year,
                app_state,
                district,
                nmms_block AS block,
                gmat_score,
                sat_score,
                (gmat_score * 0.7 + sat_score * 0.3) AS weighted_score,
                PERCENT_RANK() OVER (ORDER BY (gmat_score * 0.7 + sat_score * 0.3) DESC) AS percentile_rank
              FROM pp.applicant_primary_info
              WHERE nmms_year = $4
            )
            SELECT
              ar.applicant_id
            FROM ApplicantRanked ar
            JOIN pp.jurisdiction state_juris ON ar.app_state = state_juris.juris_code
            JOIN pp.jurisdiction district_juris ON ar.district = district_juris.juris_code
            JOIN pp.jurisdiction block_juris ON ar.block = block_juris.juris_code
            WHERE LOWER(TRIM(state_juris.juris_name)) = LOWER(TRIM($1))
              AND LOWER(TRIM(district_juris.juris_name)) = LOWER(TRIM($2))
              AND LOWER(TRIM(block_juris.juris_name)) = LOWER(TRIM($3))
              AND ar.percentile_rank <= 0.08;
          `;
        } else {
          console.warn(`Model: createShortlistBatch - Unknown criteria: ${criteriaName}. Defaulting to no applicant selection.`);
        }

        // Corrected insert query as per your input
        const insertShortlistInfoQuery = `
          INSERT INTO pp.shortlist_info (applicant_id, shortlisted_yn)
          VALUES ($1, 'Y')
        `;

        if (selectApplicantsQuery) {
          shortlistedCount = 0;
          for (const block of blockNamesLowercased) {
            const applicantResult = await pool.query(selectApplicantsQuery, [state, district, block, year]);
            console.log(`Model: createShortlistBatch - Selected ${applicantResult.rows.length} applicants for block ${block} using criteria: ${criteriaName}`);
            shortlistedCount += applicantResult.rows.length;

            for (const applicant of applicantResult.rows) {
              // Pass only the applicant.applicant_id
              await pool.query(insertShortlistInfoQuery, [applicant.applicant_id]);
              console.log(`Model: createShortlistBatch - Inserted applicant ${applicant.applicant_id} into shortlist_info for batch ${shortlistBatchId}`);
            }
          }
        }
      } else {
        console.log("Model: createShortlistBatch - No blocks selected, skipping shortlist_batch_jurisdiction and applicant selection.");
      }

      await pool.query("COMMIT");
      console.log("Model: createShortlistBatch - Transaction COMMIT");
      return { shortlistBatchId, shortlistedCount };
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Model: createShortlistBatch - Error:", error);
      throw error;
    }
  },

  async getShortlistedCountForBlocksAndYear(blockNames, year) {
    console.log("Model: getShortlistedCountForBlocksAndYear - Entered", { blockNames, year });
    try {
      const result = await pool.query(
        `
        SELECT COUNT(si.applicant_id)
        FROM pp.shortlist_info si
        WHERE si.applicant_id IN (
          SELECT api.applicant_id
          FROM pp.applicant_primary_info api
          WHERE api.nmms_year = $2 AND api.nmms_block IN (
            SELECT j.juris_code
            FROM pp.jurisdiction j
            WHERE LOWER(TRIM(j.juris_name)) = ANY($1)
          )
        );
        `,
        [blockNames.map(name => name.toLowerCase().trim()), year]
      );
      console.log("Model: getShortlistedCountForBlocksAndYear - Success", result.rows[0].count);
      return result.rows[0].count;
    } catch (error) {
      console.error("Model: getShortlistedCountForBlocksAndYear - Error:", error);
      throw error;
    }
  },
 };

 module.exports = GenerateShortlistModel;