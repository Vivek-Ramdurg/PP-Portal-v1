// Import model functions
const {
  getStudentsByCohortAndBatch,
  getAllStudents,
} = require("../../models/coordinator/studentModel");

// Controller to fetch students
const getStudentsController = async (req, res) => {
  try {
    const { cohortNumber, batchId } = req.query;

    let students;

    if (cohortNumber && batchId) {
      // ✅ If both filters are provided
      students = await getStudentsByCohortAndBatch(cohortNumber, batchId);
    } else {
      // ✅ Otherwise fetch all students
      students = await getAllStudents();
    }

    res.json(students);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ error: "Failed to fetch students" });
  }
};

// Export controller(s)
module.exports = {
  getStudentsController,
};
