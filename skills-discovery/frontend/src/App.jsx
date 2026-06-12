import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import SkillDetail from './pages/SkillDetail'
import Goals from './pages/Goals'
import GoalsLog from './pages/GoalsLog'
import Collections from './pages/Collections'
import Comparator from './pages/Comparator'
import Scraper from './pages/Scraper'
import Crud from './pages/Crud'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/skills/:id" element={<SkillDetail />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/goals/log" element={<GoalsLog />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/comparator" element={<Comparator />} />
            <Route path="/scraper" element={<Scraper />} />
            <Route path="/crud" element={<Crud />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
