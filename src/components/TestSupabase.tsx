import { useState } from "react";
import { supabase } from "../lib/supabase";

const boxStyle = {
  padding: "20px",
  border: "1px solid #ccc",
  margin: "20px",
} as const;

function TestSupabase() {
  const [status, setStatus] = useState("Not tested");
  const [details, setDetails] = useState("");

  const testConnection = async () => {
    setStatus("Testing...");
    setDetails("");

    const { data, error } = await supabase
      .from("admission_branches")
      .select("code, name")
      .limit(3);

    if (error) {
      setStatus("Connection failed");
      setDetails(
        `${error.message} Run supabase/admissions_schema.sql in the Supabase SQL editor if the admissions tables are not created yet.`,
      );
      return;
    }

    setStatus("Supabase connected successfully");
    setDetails(
      data.length > 0
        ? `Loaded ${data.length} admission branches from Supabase.`
        : "Connected, but no branch seed data was returned.",
    );
  };

  const testStorage = async () => {
    setStatus("Checking storage...");
    setDetails("");

    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      setStatus("Storage check failed");
      setDetails(error.message);
      return;
    }

    const requirementsBucket = data.find(
      (bucket) => bucket.name === "admission-requirements",
    );

    setStatus("Storage check complete");
    setDetails(
      requirementsBucket
        ? "The admission-requirements bucket is ready."
        : "Supabase is reachable, but the admission-requirements bucket was not found yet.",
    );
  };

  return (
    <div style={boxStyle}>
      <h3>Supabase Connection Test</h3>
      <button onClick={testConnection}>Test Tables</button>
      <button onClick={testStorage} style={{ marginLeft: "10px" }}>
        Test Storage
      </button>
      <p>Status: {status}</p>
      {details && <p>{details}</p>}
    </div>
  );
}

export default TestSupabase;
