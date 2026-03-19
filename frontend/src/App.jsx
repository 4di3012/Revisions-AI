import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import UploadPage from './pages/UploadPage'
import ReviewPage from './pages/ReviewPage'
import ProjectsDashboard from './pages/ProjectsDashboard'
import RevisionsDashboard from './pages/RevisionsDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/revisions" element={<RevisionsDashboard />} />
          <Route path="/review/:id" element={<ReviewPage />} />
          <Route path="/projects" element={<ProjectsDashboard />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
