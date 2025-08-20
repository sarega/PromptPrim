// src/landing.jsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/landing.css'; // Import CSS

function LandingPage() {
return (
<div className="landing-page">
<header className="header">
<div className="logo">PromptPrim.AI</div>
<nav className="navigation">
<ul>
<li><a href="#about">About the App</a></li>
<li><a href="#docs">Docs</a></li>
<li><a href="#pricing">Pricing</a></li>
<li><a href="#terms">Terms</a></li>
<li><a href="#login" className="login-button">User Login</a></li>
</ul>
</nav>
</header>

     <main className="main-content">
       <section className="hero-section">
         <div className="hero-text">
           <h1>Unlock the Power of AI with Intelligent Prompts</h1>
           <p>Create compelling and effective prompts to get the best results from AI models.</p>
           <a href={`${import.meta.env.BASE_URL}app.html`} className="primary-button">Get Started</a>
         </div>
         {/* คุณสามารถเพิ่มรูปภาพหรือวิดีโอที่น่าสนใจได้ที่นี่ */}
       </section>

       <section id="about" className="feature-section">
         <h2>About PromptPrim.AI</h2>
         <p>Explain the core features and benefits of your application here. Highlight what makes it unique and valuable to users.</p>
         {/* เพิ่ม Feature List หรือรายละเอียดเพิ่มเติมได้ */}
       </section>

       <section id="docs" className="documentation-section">
         <h2>Documentation</h2>
         <p>Link to your comprehensive documentation or provide a brief overview of how to use the app.</p>
         {/* เพิ่ม Link ไปยังหน้า Docs */}
       </section>

       <section id="pricing" className="pricing-section">
         <h2>Pricing</h2>
         <p>Outline your pricing plans or explain your app's monetization strategy.</p>
         {/* เพิ่มตารางราคาหรือรายละเอียดแผนต่างๆ */}
       </section>

       <section id="terms" className="terms-section">
         <h2>Terms of Service</h2>
         <p>Link to your terms and conditions.</p>
         {/* เพิ่ม Link ไปยังหน้า Terms */}
       </section>

       <section id="login" className="login-section">
         <h2>User Login</h2>
         <p>Direct users to your login page or provide a simple login form here.</p>
         <a href={`${import.meta.env.BASE_URL}app.html`} className="secondary-button">Login to App</a>
         {/* หรือเพิ่ม Form Login */}
       </section>
     </main>

     <footer className="footer">
       <p>&copy; {new Date().getFullYear()} PromptPrim.AI. All rights reserved.</p>
     </footer>
   </div>
 );
}

ReactDOM.createRoot(document.getElementById('root')).render(
<React.StrictMode>
<LandingPage />
</React.StrictMode>
);