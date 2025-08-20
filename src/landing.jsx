// src/landing.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/main.css'; // We still import main.css to get Tailwind

// --- [THE FIX] Define CSS styles directly in the JS file ---
const styles = {
  landingPage: {
    fontFamily: 'sans-serif',
    backgroundColor: '#f4f4f4',
    color: '#333',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    backgroundColor: '#333',
    color: '#fff',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: '1.5em',
    fontWeight: 'bold',
  },
  navigation: {
    listStyle: 'none',
    display: 'flex',
    gap: '20px',
  },
  navLink: {
    color: '#fff',
    textDecoration: 'none',
  },
  loginButton: {
    backgroundColor: '#5cb85c',
    padding: '10px 15px',
    borderRadius: '5px',
  },
  mainContent: {
    padding: '40px',
    flexGrow: 1,
    textAlign: 'center',
  },
  heroSection: {
    padding: '80px 0',
    backgroundColor: '#e9ecef',
    borderRadius: '8px',
  },
  heroTitle: {
    fontSize: '2.5em',
    marginBottom: '15px',
  },
  heroSubtitle: {
    fontSize: '1.2em',
    color: '#555',
    marginBottom: '30px',
  },
  primaryButton: {
    backgroundColor: '#007bff',
    color: '#fff',
    padding: '15px 30px',
    textDecoration: 'none',
    borderRadius: '5px',
    fontSize: '1.1em',
  },
  footer: {
    backgroundColor: '#333',
    color: '#fff',
    textAlign: 'center',
    padding: '15px',
  }
};

// --- The React Component ---
function LandingPage() {
  const handleLogin = () => {
    window.location.href = `${import.meta.env.BASE_URL}app.html`;
  };

  return (
    <div style={styles.landingPage}>
      <header style={styles.header}>
        <div style={styles.logo}>PromptPrim.AI</div>
        <nav>
          <ul style={styles.navigation}>
            <li><a href="#about" style={styles.navLink}>About</a></li>
            <li><a href="#docs" style={styles.navLink}>Docs</a></li>
            <li><a href="#pricing" style={styles.navLink}>Pricing</a></li>
            <li><a href="#" onClick={handleLogin} style={{...styles.navLink, ...styles.loginButton}}>User Login</a></li>
          </ul>
        </nav>
      </header>

      <main style={styles.mainContent}>
        <section style={styles.heroSection}>
          <h1 style={styles.heroTitle}>Unlock the Power of AI</h1>
          <p style={styles.heroSubtitle}>Create, manage, and deploy intelligent prompts with ease.</p>
          <button onClick={handleLogin} style={styles.primaryButton}>Get Started</button>
        </section>
      </main>

      <footer style={styles.footer}>
        <p>&copy; {new Date().getFullYear()} PromptPrim.AI. All rights reserved.</p>
      </footer>
    </div>
  );
}

// --- Render the app ---
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>
);
