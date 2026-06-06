import React from 'react'
import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import SkillDetail from './pages/SkillDetail'
import Goals from './pages/Goals'
import Collections from './pages/Collections'
import Comparator from './pages/Comparator'
import Scraper from './pages/Scraper'
import Crud from './pages/Crud'

function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Admin — no navbar */}
        <Route path="/crud" element={<Crud />} />

        {/* Main app */}
        <Route element={<MainLayout />}>
          <Route path="/"          element={<Home />} />
          <Route path="/skill/:id" element={<SkillDetail />} />
          <Route path="/goals"     element={<Goals />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/comparator"  element={<Comparator />} />
          <Route path="/scraper"     element={<Scraper />} />
        </Route>
      </Routes>
    </Router>
  )
}
