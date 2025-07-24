import React, { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { useAuth } from "./contexts/AuthContext";
import { navConfig } from "./config/navConfig";
import "./Layout.css";

const Layout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { user } = useAuth();

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const roleKey = user?.role?.toLowerCase();
  const navItems = navConfig[roleKey] || [];

  return (
    <div className="layout-wrapper">
      <Header />
      <div className="main-section">
        <div className={`sidebar-container ${isSidebarCollapsed ? "collapsed" : ""}`}>
          <Navbar
            isCollapsed={isSidebarCollapsed}
            toggleSidebar={toggleSidebar}
            navItems={navItems}
          />
        </div>

        <div className={`content ${isSidebarCollapsed ? "content-collapsed" : ""}`}>
          <Outlet />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Layout;