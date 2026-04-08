import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import PortfolioPage from './pages/PortfolioPage';
import MyPortfolioPage from './pages/MyPortfolioPage';
import MethodologyPage from './pages/MethodologyPage';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header>
        <h1>Portfolio Allocation</h1>
        <nav className="nav">
          <NavLink to="/" end>Risk Parity Calculator</NavLink>
          <NavLink to="/my-portfolio">My Portfolio</NavLink>
          <NavLink to="/methodology">Methodology</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<PortfolioPage />} />
          <Route path="/my-portfolio" element={<MyPortfolioPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
        </Routes>
      </main>
    </div>
  );
}
