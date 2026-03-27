import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdmissionHome from "./pages/admission/AdmissionHome";
import AdmissionStep1 from "./pages/admission/AdmissionStep1";
import AdmissionStep2 from "./pages/admission/AdmissionStep2";
import AdmissionStep3 from "./pages/admission/AdmissionStep3";
import AdmissionStep4 from "./pages/admission/AdmissiontStep4";
import AdmissionStep5 from "./pages/admission/AdmissionStep5";

import { StudentProvider } from "./contexts";
import StudentHome from "./pages/student/StudentHome.tsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public admission home */}
        <Route path="/" element={<AdmissionHome />} />
        <Route path="/admission" element={<AdmissionHome />} />
        <Route path="/enroll" element={<AdmissionStep1 />} />
        <Route path="/information" element={<AdmissionStep2 />} />
        <Route path="/requirements" element={<AdmissionStep3 />} />
        <Route path="/confirmation" element={<AdmissionStep4 />} />
        <Route path="/scholarship-exam" element={<AdmissionStep5 />} />

        {/* Private student side */}
        <Route
          path="/student/home"
          element={
            <StudentProvider>
              <StudentHome />
            </StudentProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
