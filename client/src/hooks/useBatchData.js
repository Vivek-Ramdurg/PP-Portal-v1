import { useState, useEffect } from "react";
import axios from "axios";

const useBatchData = (batchId) => {
  const [data, setData] = useState({ students: [], batchInfo: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!batchId) return;

    const fetchBatchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [batchRes, studentsRes] = await Promise.all([
          axios.get(`${process.env.REACT_APP_BACKEND_API_URL}/api/batches/${batchId}`),
          axios.get(`${process.env.REACT_APP_BACKEND_API_URL}/api/batches/${batchId}/students`),
        ]);
        setData({ batchInfo: batchRes.data, students: studentsRes.data });
      } catch (err) {
        console.error("Error fetching batch data:", err);
        setError("Failed to fetch student data. The batch may not exist or an error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchBatchData();
  }, [batchId]);

  return { ...data, loading, error };
};

export default useBatchData;
