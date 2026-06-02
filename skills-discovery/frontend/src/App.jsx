import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import SkillDetail from './pages/SkillDetail'
import Goals from './pages/Goals'
import Collections from './pages/Collections'
import Comparator from './pages/Comparator'

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-gray-100">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/skill/:id" element={<SkillDetail />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/comparator" element={<Comparator />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
