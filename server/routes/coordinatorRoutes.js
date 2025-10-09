// server/routes/coordinatorRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" }); // for CSV file uploads
// Controllers (✅ fixed paths to go up two levels from routes → controllers)
const { getSubjects } = require("../controllers/coordinator/subjectController");
const { getStudentsController } = require("../controllers/coordinator/studentController");
const { fetchBatches, createBatchController } = require("../controllers/coordinator/batchController");
const { fetchCohorts } = require("../controllers/coordinator/cohortController");
const authenticate = require("../middleware/authMiddleware");

const {
  fetchAttendance,
  submitBulkAttendance,
  uploadCSVAttendance,
  downloadSampleCSV,
} = require("../controllers/coordinator/attendanceController");

const { fetchClassrooms } = require("../controllers/coordinator/classroomController");

// Base Route
router.get("/", (req, res) => {
  res.send("Coordinator Home");
});

// 🔹 Students (use query params instead of duplicate params)
// Example: /students?cohortNumber=1&batchId=2
router.get("/students", getStudentsController);

// Cohorts
router.get("/cohorts", authenticate, fetchCohorts);

// Batches
router.get("/batches", authenticate , fetchBatches);

// Subjects
router.get("/subjects", getSubjects);

// Classrooms
router.get("/classrooms/:batchId", fetchClassrooms);

// Attendance
// Example URL: /attendance?cohort=1&batch=2&classroom=3&date=2025-09-07&startTime=10:00&endTime=11:00&subject=5
router.get("/attendance", fetchAttendance);

router.post("/attendance/bulk", submitBulkAttendance); // bulk upload JSON
router.post(
  "/attendance/csv",
  upload.single("file"), // multer middleware
  uploadCSVAttendance    // bulk upload CSV
);

// Sample CSV download
//router.get("/attendance/sample-csv", downloadSampleCSV);

module.exports = router;
