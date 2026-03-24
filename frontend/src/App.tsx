import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import PortfolioPage from './pages/PortfolioPage';
import MethodologyPage from './pages/MethodologyPage';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header>
        <h1>Portfolio Allocation</h1>
        <nav className="nav">
          <NavLink to="/" end>Calculator</NavLink>
          <NavLink to="/methodology">Methodology</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<PortfolioPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
        </Routes>
      </main>
    </div>
  );
}
