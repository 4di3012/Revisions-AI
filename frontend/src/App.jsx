import { BrowserRouter, Routes, Route } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import ReviewPage from './pages/ReviewPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  )
}
