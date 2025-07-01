import React, { useState, FormEvent, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// --- Utility Functions ---

const getTodaysDateString = () => new Date().toISOString().split('T')[0];

const calculateOverallProgressDisplay = (goal) => {
  if (!goal) return { percent: 0, text: 'N/A' };
  if (goal.type === 'Learning' && goal.modules) {
    const totalModules = goal.modules.length;
    if (totalModules === 0) return { percent: 0, text: 'No modules' };
    
    const verifiedCount = goal.modules.filter(m => m.verified).length;
    const completedNotVerifiedCount = goal.modules.filter(m => m.status === 'completed' && !m.verified).length;
    
    // Give full weight to verified, half to completed but not verified
    const effectiveProgressValue = verifiedCount + (completedNotVerifiedCount * 0.5);
    const percent = totalModules > 0 ? Math.round((effectiveProgressValue / totalModules) * 100) : 0;

    return {
      percent: percent,
      text: `${verifiedCount} Verified, ${completedNotVerifiedCount} Self-Completed / ${totalModules} Total Modules`
    };
  }
  // For non-learning goals, use existing progressPercent and statusText
  return { percent: goal.progressPercent || 0, text: goal.statusText || (goal.progressPercent === 100 ? 'Completed!' : 'Not started') };
};


// --- MOCK DATA & STATE MANAGEMENT (Prototype) ---

let mockUserProfile = {
    name: 'GoalGetter User',
    avatar: '🧑‍🚀', 
    joinDate: 'June 20, 2024',
    xp: 85,
    level: 1,
    darkMode: false,
    unlockedPerks: [],
    buddy: {
      name: 'Alex Taylor', avatar: '🧑‍💻', xp: 1100, streak: 5
    }
};

const LEVEL_THRESHOLDS = { 1: 0, 2: 100, 3: 250, 4: 500, 5: 1000 };
const UNLOCKABLES = [
    { name: 'Dark Mode Theme', xpRequired: 100, id: 'dark_mode' },
    { name: 'Buddy Insight Stats', xpRequired: 200, id: 'buddy_stats' },
    { name: 'Custom Goal Categories', xpRequired: 300, id: 'custom_categories' },
    { name: 'Community Quests', xpRequired: 500, id: 'community_quests' },
];

let mockCheckinsLog = [];
let mockXpLog = [];

// Helper to generate some initial data for the charts
const generateMockLogs = () => {
    mockCheckinsLog = [];
    mockXpLog = [];
    let cumulativeXp = 0;
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        
        const didCheckIn = Math.random() > 0.3; // 70% chance of checking in
        if(didCheckIn) {
            mockCheckinsLog.push({ date: dateString, count: 1 });
            const xpGained = Math.floor(Math.random() * 10) + 5; // 5-14 XP
            cumulativeXp += xpGained;
        }
        mockXpLog.push({ date: dateString, xp: cumulativeXp });
    }
};
generateMockLogs(); // Initial generation

const awardXp = (amount) => {
    if (amount === 0) return;

    mockUserProfile.xp += amount;
    const today = getTodaysDateString();

    // Update XP log
    const todayLogIndex = mockXpLog.findIndex(log => log.date === today);
    if (todayLogIndex > -1) {
        mockXpLog[todayLogIndex].xp = mockUserProfile.xp;
    } else {
        mockXpLog.push({ date: today, xp: mockUserProfile.xp });
    }
    // Simple shift if log gets too long
    if(mockXpLog.length > 60) mockXpLog.shift();


    // Check for level ups
    const currentLevel = mockUserProfile.level;
    const nextLevel = currentLevel + 1;
    if (LEVEL_THRESHOLDS[nextLevel] && mockUserProfile.xp >= LEVEL_THRESHOLDS[nextLevel]) {
        mockUserProfile.level = nextLevel;
    }

    // Check for unlocks
    UNLOCKABLES.forEach(unlock => {
        if (mockUserProfile.xp >= unlock.xpRequired && !mockUserProfile.unlockedPerks.find(p => p.id === unlock.id)) {
            mockUserProfile.unlockedPerks.push(unlock);
            // In a real app, you'd show a notification here
            console.log(`Perk Unlocked: ${unlock.name}!`);
        }
    });
};


// --- Page Components ---

const WelcomeScreen = ({ navigateTo }) => (
  <div className="welcome-page">
    <div className="welcome-content-wrapper">
      <div className="welcome-logo">
        <div className="app-logo-placeholder" aria-label="GoalMate Logo Placeholder">Logo</div>
        <span className="welcome-logo-text">GoalMate</span>
      </div>
      <h1 className="welcome-headline">Crush your coding or language goals with a buddy.</h1>
      <p className="welcome-tagline">
        Define your ambition, partner with an accountability buddy, and track your progress together.
      </p>
      
      <div className="welcome-key-features">
        <div className="welcome-feature-item">
          <span className="feature-icon" aria-hidden="true">🎯</span>
          <p>Set Focused Goals</p>
        </div>
        <div className="welcome-feature-item">
          <span className="feature-icon" aria-hidden="true">🧑‍🤝‍🧑</span>
          <p>Get a Buddy</p>
        </div>
        <div className="welcome-feature-item">
          <span className="feature-icon" aria-hidden="true">📈</span>
          <p>Track Shared XP</p>
        </div>
      </div>

      <div className="welcome-actions">
        <button onClick={() => navigateTo('auth', { view: 'signup' })} className="btn btn-primary btn-welcome-action">
          Join the Journey
        </button>
        <button onClick={() => navigateTo('auth', { view: 'login' })} className="btn btn-secondary btn-welcome-action">
          Already a Mate? Log In
        </button>
      </div>
      <div className="mascot-placeholder welcome-mascot-spot">Mascot Here!</div>
    </div>
    <div className="welcome-bg-elements" aria-hidden="true">
      <span className="bg-shape shape1"></span>
      <span className="bg-shape shape2"></span>
      <span className="bg-shape shape3"></span>
    </div>
  </div>
);

const AuthPage = ({ navigateTo, initialView = 'login' }) => {
  const [isLoginView, setIsLoginView] = useState(initialView === 'login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setIsLoginView(initialView === 'login');
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPasswordVisible(false);
    setConfirmPasswordVisible(false);
    setError('');
  }, [initialView]);


  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(''); 

    if (!email) {
        setError("Please enter your email address.");
        return;
    }
    if (!password) {
        setError(isLoginView ? "Please enter your password." : "Please create a password.");
        return;
    }

    if (!isLoginView) { 
        if (!fullName) {
            setError("Please enter your full name.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (!confirmPassword) {
            setError("Please confirm your password.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match. Please re-enter.");
            return;
        }
    }
    console.log(isLoginView ? 'Login attempt:' : 'Signup attempt:', { fullName: isLoginView ? undefined : fullName, email });
    setTimeout(() => {
        if (isLoginView) {
            navigateTo('mainHome', { activeView: 'dashboard' });
        } else { 
            navigateTo('tagSelection');
        }
    }, 500);
  };

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const toggleConfirmPasswordVisibility = () => {
    setConfirmPasswordVisible(!confirmPasswordVisible);
  };
  
  const signupIllustrations = [
    {
        title: "📊 Track Your Progress Dynamically",
        text: "Visualize milestones and stay on top of your goals with intuitive tracking tools.",
        icon: "📈",
        bgColor: "var(--color-accent1)"
    },
    {
        title: "🧑‍🤝‍🧑 Partner with an Accountability Buddy",
        text: "Connect with a partner to stay motivated and learn together.",
        icon: "💬",
        bgColor: "var(--color-accent2)"
    },
    {
        title: "💡 Get AI-Powered Insights",
        text: "Receive smart suggestions and encouragement to keep you on the right path.",
        icon: "✨",
        bgColor: "var(--color-primary)"
    }
  ];
  const [currentSignupIllustration, setCurrentSignupIllustration] = useState(0);

  useEffect(() => {
    let interval;
    if (!isLoginView) {
        interval = setInterval(() => {
            setCurrentSignupIllustration(prev => (prev + 1) % signupIllustrations.length);
        }, 4000); // Change illustration every 4 seconds for signup view
    }
    return () => clearInterval(interval);
  }, [isLoginView, signupIllustrations.length]);


  const commonLeftPanel = (
    <div className="auth-illustration-panel-content">
      <div className="auth-logo-area">
        <div className="app-logo-placeholder" aria-label="GoalMate Logo Placeholder">Logo</div>
        <span className="auth-logo-text">GoalMate</span>
      </div>
      {isLoginView ? (
        <>
          <div className="auth-illustration-headlines">
            <h1>Welcome Back!</h1>
            <p>Continue your journey to success. Your goals are waiting.</p>
          </div>
          <div className="auth-illustrative-cards-section staggered-animation-container">
             <div className="auth-illustration-ui-card" style={{textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)'}}>
                <span className="graphic-icon" aria-hidden="true" style={{fontSize: '3rem', color: 'var(--color-white)', display: 'block', marginBottom: '10px'}}>🤝</span>
                <h4 style={{color: 'var(--color-white)'}}>Your Goals, Shared</h4>
                <p style={{color: 'var(--color-white)', opacity: 0.8}}>Pick up where you left off and keep the momentum going!</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="auth-illustration-headlines">
            <h1>Achieve More, Together.</h1>
            <p>Set ambitious goals, build lasting habits, and find your accountability partners on GoalMate.</p>
          </div>
            <div className="auth-illustrative-cards-section auth-signup-carousel">
                {signupIllustrations.map((item, index) => (
                    <div
                        key={item.title}
                        className={`auth-illustration-ui-card dynamic-signup-card ${index === currentSignupIllustration ? 'active' : ''}`}
                        style={{ '--card-accent-color': item.bgColor } as React.CSSProperties}
                    >
                        <span className="dynamic-card-icon" aria-hidden="true">{item.icon}</span>
                        <h4>{item.title}</h4>
                        <p>{item.text}</p>
                    </div>
                ))}
                 <div className="mascot-placeholder" style={{width: '60px', height: '60px', fontSize:'0.6rem', alignSelf: 'center', marginTop: '15px'}}>Mascot!</div>
            </div>
        </>
      )}
      <div className="decorative-bg-dots" aria-hidden="true"></div>
    </div>
  );

  return (
    <div className="auth-layout">
      <div className="auth-illustration-panel">
        {commonLeftPanel}
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-panel-header">
          <p>
            {isLoginView ? "Need an account?" : "Already have an account?"}{' '}
            <button 
              onClick={() => { 
                setIsLoginView(!isLoginView); 
              }} 
              className="btn-link"
            >
              {isLoginView ? 'Sign Up' : 'Log in'}
            </button>
          </p>
        </div>
        <div className="auth-form-panel-content">
          <div className="auth-form-intro">
            <h2>
              {isLoginView ? "Log In to Your Account" : "Join a community that helps you crush your goals"}{' '}
              <span role="img" aria-label="waving hand">👋</span>
            </h2>
            <p>
              {isLoginView ? "Enter your credentials to access your dashboard." : "Track progress, build habits, and stay motivated — together."}
            </p>
          </div>

          {error && (
            <div className="error-message-box" role="alert">
              <span className="error-icon" aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form-main">
            {!isLoginView && (
              <div className="form-group">
                <label htmlFor="fullName">Full legal name</label>
                <input
                  type="text"
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  aria-describedby={error && error.includes("name") ? "name-error" : undefined}
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-describedby={error && error.includes("email") ? "email-error" : undefined}
              />
            </div>
            <div className="form-group password-form-group">
              <label htmlFor="password">{isLoginView ? "Password" : "Create password"}</label>
              <div className="password-input-wrapper">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-describedby={error && error.toLowerCase().includes("password") && !error.toLowerCase().includes("confirm") ? "password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="password-toggle-btn"
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                >
                  {passwordVisible ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {!isLoginView && (
              <>
                <div className="form-group password-form-group">
                  <label htmlFor="confirmPassword">Confirm password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={confirmPasswordVisible ? 'text' : 'password'}
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      aria-describedby={error && error.toLowerCase().includes("password") && error.toLowerCase().includes("confirm") ? "confirm-password-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={toggleConfirmPasswordVisibility}
                      className="password-toggle-btn"
                      aria-label={confirmPasswordVisible ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {confirmPasswordVisible ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>
                 <ul className="password-reqs-list" aria-label="Password requirements">
                    <li><span aria-hidden="true">✓</span> 8+ characters</li>
                    <li><span aria-hidden="true">✓</span> 1 uppercase (Recommended)</li>
                    <li><span aria-hidden="true">✓</span> 1 number (Recommended)</li>
                    <li><span aria-hidden="true">✓</span> 1 symbol (Recommended)</li>
                </ul>
              </>
            )}
            
            {isLoginView && (
                <div className="form-group-extra-links">
                    <a href="#forgot-password" onClick={(e) => {e.preventDefault(); alert('Forgot password functionality not yet implemented.');}} className="btn-link">Forgot password?</a>
                </div>
            )}

            <button type="submit" className="btn btn-primary btn-block btn-auth-action">
              {isLoginView ? 'Log In' : 'Get Started'}
            </button>
          </form>
          {!isLoginView && (
            <p className="auth-legal-links">
              By signing up, you agree to our{' '}
              <a href="#terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and{' '}
              <a href="#privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            </p>
          )}
        </div>
         <button
          onClick={() => navigateTo('welcome')}
          className="btn btn-secondary btn-back-to-welcome"
          aria-label="Back to Welcome page"
         >
          Back to Welcome
         </button>
      </div>
      
      <div className="auth-fab-group">
          <button className="auth-fab-button" aria-label="Help" onClick={() => alert('Help button clicked!')}>
              <span role="img" aria-hidden="true">❓</span>
          </button>
          <button className="auth-fab-button" aria-label="Privacy Settings" onClick={() => alert('Privacy settings clicked!')}>
              <span role="img" aria-hidden="true">🛡️</span>
          </button>
      </div>
    </div>
  );
};

const TagSelectionPage = ({ navigateTo }) => {
  const codingTags = [
    { emoji: '💻', text: 'Python' }, { emoji: '⚛️', text: 'React' },
    { emoji: '📜', text: 'JavaScript' }, { emoji: '🧑‍💻', text: 'LeetCode' },
    { emoji: '🤖', text: 'Machine Learning' }, { emoji: '🌐', text: 'Web Development' },
  ];

  const languageTags = [
    { emoji: '🇯🇵', text: 'Japanese' }, { emoji: '🇪🇸', text: 'Spanish' },
    { emoji: '🇫🇷', text: 'French' }, { emoji: '🗣️', text: 'Duolingo' },
    { emoji: '✍️', text: 'Vocabulary' }, { emoji: '💬', text: 'Conversation Practice' },
  ];

  const [selectedTags, setSelectedTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  const addTag = (tag) => {
    if (tag.text.trim() === '') return;
    if (!selectedTags.find(t => t.text.toLowerCase() === tag.text.toLowerCase())) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleTagInputChange = (e) => {
    setTagInput(e.target.value);
  };

  const handleTagInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag({ text: tagInput.trim(), emoji: '🏷️' }); // Default emoji for custom tags
      setTagInput('');
    }
  };

  const handleSuggestedTagClick = (tag) => {
    addTag(tag);
  };

  const removeTag = (tagToRemove) => {
    setSelectedTags(selectedTags.filter(tag => tag.text !== tagToRemove.text));
  };
  
  const handleNext = () => {
    console.log("Selected Tags:", selectedTags);
    navigateTo('meetBuddy', { selectedInterests: selectedTags });
  };

  const TagSection = ({ title, tags }) => (
    <div className="suggested-tags-section">
      <h2 className="suggested-tags-title">{title}</h2>
      <div className="suggested-tags-grid staggered-animation-container">
        {tags.map(tag => (
          <button 
            key={tag.text} 
            className={`tag-bubble ${selectedTags.find(t => t.text === tag.text) ? 'selected' : ''}`}
            onClick={() => handleSuggestedTagClick(tag)}
            aria-label={`Select interest: ${tag.text}`}
            disabled={selectedTags.find(t => t.text === tag.text)}
          >
            <span className="tag-bubble-emoji" aria-hidden="true">{tag.emoji}</span>
            <span className="tag-bubble-text">{tag.text}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="page-container tag-selection-page-enhanced">
      <header className="page-header">
        <h1>🌱 What are you learning?</h1>
        <p>Pick your focus area. This helps us find you the perfect accountability buddy.</p>
      </header>
      <div className="page-content">
        <div className="selected-tags-display-area" aria-live="polite">
          {selectedTags.length === 0 ? (
            <p className="selected-tags-placeholder-text">Your chosen interests will shine here! ✨ Click suggestions below.</p>
          ) : (
            <div className="selected-tags-list">
              {selectedTags.map(tag => (
                <span key={tag.text} className="selected-tag-pill">
                  {tag.emoji && <span className="tag-pill-emoji" aria-hidden="true">{tag.emoji}</span>}
                  {tag.text}
                  <button onClick={() => removeTag(tag)} className="remove-tag-btn" aria-label={`Remove tag ${tag.text}`}>&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <TagSection title="💡 Coding & Development" tags={codingTags} />
        <TagSection title="🗣️ Language Learning" tags={languageTags} />
        
        <div className="form-group" style={{marginTop: '20px'}}>
          <label htmlFor="tag-input">Or add your own specific tag (press Enter to add)</label>
          <input 
            type="text" 
            id="tag-input" 
            placeholder="e.g., Data Structures, Kanji" 
            className="form-control" 
            value={tagInput}
            onChange={handleTagInputChange}
            onKeyDown={handleTagInputKeyDown}
          />
        </div>

        <div className="tag-selection-actions">
          <button onClick={handleNext} className="btn btn-primary btn-block" disabled={selectedTags.length === 0}>Next: Meet Your Buddy</button>
          <button onClick={() => navigateTo('auth', { view: 'signup' })} className="btn btn-outline-light btn-block">Back</button>
        </div>
      </div>
    </div>
  );
};


const MeetYourBuddyPage = ({ navigateTo }) => (
  <div className="page-container">
    <header className="page-header">
      <h1>Meet Your Buddy!</h1>
      <p>We've suggested an accountability partner based on your interests.</p>
    </header>
    <div className="page-content">
      <div className="buddy-card-placeholder" style={{border: '1px solid var(--color-surface)', padding: '20px', borderRadius: 'var(--border-radius-lg)', background: 'var(--color-surface)', textAlign: 'center', boxShadow: 'var(--shadow-md)'}}>
        <div className="avatar-placeholder" style={{width: '80px', height: '80px', borderRadius: '50%', background: 'var(--color-accent1)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
           <span className="avatar-icon" aria-hidden="true">🧑‍🤝‍🧑</span>
        </div>
        <h3>Alex Taylor</h3>
        <p>Interests: React, JavaScript</p>
         <div className="mascot-placeholder" style={{width: '50px', height: '50px', fontSize:'0.5rem', margin: '10px auto 0'}}>Mascot!</div>
      </div>
      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button onClick={() => navigateTo('mainHome', { activeView: 'chat' })} className="btn btn-primary btn-block">Start Chat</button>
        <button onClick={() => navigateTo('mainHome', { activeView: 'dashboard' })} className="btn btn-secondary btn-block">Go to Dashboard</button>
         <button onClick={() => navigateTo('tagSelection')} className="btn btn-outline-light btn-block">Back</button>
      </div>
    </div>
  </div>
);

const AppNavbar = ({ navigateTo }) => (
  <nav className="app-navbar">
    <div className="navbar-container-app">
      <span className="navbar-brand-app" onClick={() => navigateTo('mainHome', { activeView: 'dashboard' })}>GoalMate</span>
      <div className="app-nav-links">
        <button onClick={() => navigateTo('mainHome', { activeView: 'dashboard' })} className="app-nav-link">Dashboard</button>
        <button onClick={() => navigateTo('mainHome', { activeView: 'milestoneGoals' })} className="app-nav-link">Milestone Goals</button>
        <button onClick={() => navigateTo('mainHome', { activeView: 'notificationsView' })} className="app-nav-link">Notifications</button>
        <button onClick={() => navigateTo('mainHome', { activeView: 'profile' })} className="app-nav-link">Profile</button>
        <button onClick={() => navigateTo('mainHome', { activeView: 'settings' })} className="app-nav-link">Settings</button>
      </div>
    </div>
  </nav>
);

const LeftSidebar = ({ onNavigate, currentView }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'milestoneGoals', label: 'Milestone Goals', icon: '🎯' },
    { id: 'dailyHabits', label: 'Daily Habits', icon: '🌿' },
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside className="left-sidebar">
      <div className="sidebar-logo-area">
        <div className="app-logo-placeholder" aria-label="GoalMate Logo Placeholder">Logo</div>
        <span className="sidebar-logo-text">GoalMate</span>
      </div>
      <nav className="sidebar-nav">
        <ul>
          {navItems.map(item => (
            <li key={item.id}>
              <button 
                onClick={() => onNavigate(item.id)} 
                className={`sidebar-nav-item ${currentView === item.id ? 'active' : ''}`}
                aria-current={currentView === item.id ? 'page' : undefined}
              >
                <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

// --- New Dashboard Components ---
const MilestoneGoalsPreview = ({ goals, navigateTo }) => (
    <div className="mission-card-reimagined">
      <h4><span className="mission-icon">🎯</span> Top Milestone Goals</h4>
      <div className="milestone-preview-list">
        {goals.filter(g => (calculateOverallProgressDisplay(g).percent || 0) < 100).slice(0, 2).map(goal => {
          const progress = calculateOverallProgressDisplay(goal);
          return (
            <div key={goal.id} className="milestone-preview-item" onClick={() => navigateTo('mainHome', { activeView: 'goalProgressView', goalId: goal.id })}>
              <span className="milestone-preview-emoji">{goal.emoji}</span>
              <div className="milestone-preview-info">
                <span className="milestone-preview-title">{goal.title}</span>
                <div className="milestone-preview-progress-bar-container">
                  <div className="milestone-preview-progress-bar" style={{ width: `${progress.percent}%` }}></div>
                </div>
              </div>
              <span className="milestone-preview-percent">{progress.percent}%</span>
            </div>
          )
        })}
         {goals.filter(g => (calculateOverallProgressDisplay(g).percent || 0) < 100).length === 0 && (
              <p className="preview-empty-text">All goals achieved! 🚀</p>
          )}
      </div>
      <button onClick={() => navigateTo('mainHome', { activeView: 'milestoneGoals' })} className="btn btn-sm btn-outline-light btn-block">View All Milestones</button>
    </div>
  );

const TopStreakCard = () => {
    const topStreak = Math.max(...mockTrackersData.map(t => t.currentStreak || 0));
    const topStreakTracker = mockTrackersData.find(t => t.currentStreak === topStreak);

    return (
        <div className="stat-card-reimagined">
            <span className="stat-card-icon">🔥</span>
            <div className="stat-card-info">
                <span className="stat-card-value">{topStreak} Days</span>
                <span className="stat-card-label">Top Daily Streak</span>
            </div>
            {topStreakTracker && <span className="stat-card-context">{topStreakTracker.name}</span>}
        </div>
    )
};

const SharedXpStatCard = ({ userXp = 1250, buddyXp = 1100 }) => {
    const totalXp = userXp + buddyXp;
    const userPercent = totalXp > 0 ? (userXp / totalXp) * 100 : 50;

    return (
        <div className="stat-card-reimagined shared-xp-stat-card">
            <span className="stat-card-icon">🧑‍🤝‍🧑</span>
            <div className="stat-card-info">
                <span className="stat-card-value">{totalXp.toLocaleString()}</span>
                <span className="stat-card-label">Total Shared XP</span>
            </div>
            <div className="shared-xp-bar-container-reimagined">
                <div className="shared-xp-bar-segment-reimagined user" style={{ width: `${userPercent}%` }} title={`You: ${userXp} XP`}></div>
            </div>
             <div className="xp-labels-reimagined">
                <span>You: {userXp}</span>
                <span>Buddy: {buddyXp}</span>
            </div>
        </div>
    );
};

const BotBuddyStatus = () => (
    <div className="bot-buddy-status-widget">
        <p>Your buddy seems inactive. <strong>BotBuddy</strong> will guide you today! 🤖</p>
    </div>
);

const MainDashboardContent = ({ navigateTo, userGoals }) => {
  const [timeOfDayGreeting, setTimeOfDayGreeting] = useState('');
  const [timeOfDayEmoji, setTimeOfDayEmoji] = useState('');
  const [weeklyQuest, setWeeklyQuest] = useState(null);
  const [isQuestLoading, setIsQuestLoading] = useState(false);
  const [questError, setQuestError] = useState('');
  const [isBuddyActive] = useState(false); // Simulated state for BotBuddy
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false); // Add loading state

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setTimeOfDayGreeting('Good Morning!');
      setTimeOfDayEmoji('☀️');
    } else if (hour < 18) {
      setTimeOfDayGreeting('Good Afternoon!');
      setTimeOfDayEmoji('😎');
    } else {
      setTimeOfDayGreeting('Good Evening!');
      setTimeOfDayEmoji('🌙');
    }
  }, []);

  const fetchWeeklyQuest = async () => {
    setIsQuestLoading(true);
    setWeeklyQuest(null);
    setQuestError('');
    try {
      if (!userGoals || userGoals.length === 0) {
        setQuestError("Add a goal to get a weekly quest.");
        return;
      }
      const quest = await getWeeklyQuest(userGoals);
      setWeeklyQuest(quest);
    } catch (error) {
      console.error("Failed to fetch weekly quest:", error);
      setQuestError("Could not fetch a quest right now.");
    } finally {
      setIsQuestLoading(false);
    }
  };
  
  useEffect(() => { 
    fetchWeeklyQuest();
  }, [userGoals]);
  
  const handleCheckIn = async () => {
    // Prevent multiple submissions by checking the loading state
    if (isCheckingIn || isCheckedIn) return;

    // Set loading state to true to disable the button and show feedback
    setIsCheckingIn(true);

    try {
      // --- Supabase Integration ---
      // This function sends data to your Supabase database.
      // We are inserting a new record into the 'checkins' table.
      const { error } = await supabase
        .from('checkins') // Specify the table name
        .insert({ 
          // In a real app with authentication, you would get the user's ID from the session.
          // For this example, we use a static placeholder string as requested.
          user_id: 'a-unique-user-id-placeholder', 
          // We're using the current date and time in ISO format, a standard for timestamps.
          date: new Date().toISOString(),
        });

      // The Supabase client returns an 'error' object if something went wrong with the database operation.
      if (error) {
        // If an error occurred, we throw it to be caught by our 'catch' block below.
        throw error;
      }

      // --- Success State ---
      // If the insert was successful (no error was thrown), we update the app's state.
      setIsCheckedIn(true); // This will change the button's appearance and disable it.
      awardXp(10); // Award experience points for the action.
      alert("Daily Check-in Logged! +10 XP"); // Let the user know it worked.

    } catch (error) {
      // This block runs if the 'try' block fails (e.g., Supabase insert error).
      // This is essential for handling network issues or database problems gracefully.
      console.error("Error during check-in with Supabase:", error.message);
      // Show a user-friendly error message.
      alert('Sorry, there was a problem saving your check-in. Please try again later.');
    } finally {
      // This block runs after the 'try' (or 'catch') block has finished.
      // We use it to reset the loading state, re-enabling the button if there was an error.
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="main-dashboard-reimagined">
        <header className="main-content-header">
            <h1>Welcome, GoalGetter! <span className="welcome-time-greeting">{timeOfDayGreeting} {timeOfDayEmoji}</span></h1>
        </header>

        <div className="dashboard-hero-card">
            <div className="hero-text-content">
                <h3>Today's Focus</h3>
                <p>One tap is all it takes to build momentum. Log your progress for the day.</p>
            </div>
            <button 
                onClick={handleCheckIn} 
                className={`btn btn-lg ${isCheckedIn ? 'btn-success' : 'btn-primary'}`}
                disabled={isCheckedIn || isCheckingIn}
            >
                {isCheckingIn ? "Saving..." : isCheckedIn ? "Checked In! 🎉" : "1-Tap Check-in"}
            </button>
        </div>

        {!isBuddyActive && <BotBuddyStatus />} 

        <h2 className="dashboard-section-title">Progress Snapshot</h2>
        <div className="dashboard-stats-grid-reimagined">
            <SharedXpStatCard userXp={mockUserProfile.xp} buddyXp={mockUserProfile.buddy.xp} />
            <TopStreakCard />
            <div className="stat-card-reimagined">
                <span className="stat-card-icon">🎯</span>
                <div className="stat-card-info">
                    <span className="stat-card-value">{userGoals.filter(g => (calculateOverallProgressDisplay(g).percent || 0) < 100).length}</span>
                    <span className="stat-card-label">Active Milestones</span>
                </div>
            </div>
        </div>

        <h2 className="dashboard-section-title">Your Missions</h2>
        <div className="dashboard-missions-grid-reimagined">
            <div className="mission-card-reimagined weekly-quest-reimagined">
                <h4><span className="mission-icon">🗺️</span> This Week's Quest</h4>
                {isQuestLoading && <div className="loading-spinner-container small-spinner"><div className="loading-spinner"></div><p>Summoning quest...</p></div>}
                {!isQuestLoading && weeklyQuest && (
                    <div className="mission-content">
                        <p className="mission-title">{weeklyQuest.title}</p>
                        <p className="mission-description">{weeklyQuest.description}</p>
                         {weeklyQuest.relatedGoal && <p className="quest-related-goal">Related Goal: <em>{weeklyQuest.relatedGoal}</em></p>}
                    </div>
                )}
                {!isQuestLoading && questError && (
                    <div className="mission-content error-message-box" role="alert"><p>{questError}</p></div>
                )}
                <button 
                    onClick={fetchWeeklyQuest} 
                    className="btn btn-sm btn-secondary" 
                    disabled={isQuestLoading}
                >
                    {isQuestLoading ? 'Loading...' : 'Refresh Quest'}
                </button>
            </div>
            
            <MilestoneGoalsPreview goals={userGoals} navigateTo={navigateTo} />
        </div>
    </div>
  );
};


const RightPanel = ({ isCollapsed, onToggleCollapse }) => (
  <aside className={`right-panel ${isCollapsed ? 'collapsed' : ''}`}>
    <button 
        onClick={onToggleCollapse} 
        className="right-panel-toggle" 
        aria-label={isCollapsed ? "Expand widgets panel" : "Collapse widgets panel"}
        aria-expanded={!isCollapsed}
    >
      {isCollapsed ? '⟩' : '⟨'}
    </button>
    <div className="right-panel-content">
      <div className="widget">
        <h3>🔔 Notifications</h3>
        <div className="widget-content-placeholder">
            <p>No new notifications.</p>
        </div>
      </div>
      <div className="widget">
        <h3>💡 AI Suggestion</h3>
        <div className="widget-content-placeholder"><p>Your buddy is making great progress on React. Maybe review a concept together?</p></div>
      </div>
    </div>
  </aside>
);

// IMPORTANT: This global mutable variable `mockGoalsData` is a simplification for this demo.
let mockGoalsData = [
  { 
    id: 'React101', 
    title: 'Learn React Fundamentals', 
    emoji: '⚛️', 
    type: 'Learning', 
    category: 'Coding', 
    description: 'Complete all modules for React fundamentals, verifying understanding along the way.',
    linkedHabitId: 'h1',
    modules: [ 
        { id: 'm1', name: 'Introduction to JSX', status: 'completed', verified: true, source: 'user' },
        { id: 'm2', name: 'Components and Props', status: 'completed', verified: false, source: 'user' },
        { id: 'm3', name: 'State and Lifecycle', status: 'pending', verified: false, source: 'user' },
        { id: 'm4', name: 'Handling Events', status: 'pending', verified: false, source: 'user' },
        { id: 'm5', name: 'Conditional Rendering', status: 'pending', verified: false, source: 'user' },
    ],
  },
  { 
    id: 'JapaneseN5', 
    title: 'Reach N5 Japanese Proficiency', 
    emoji: '🇯🇵', 
    type: 'Learning', 
    category: 'Language Learning', 
    description: 'Learn Hiragana, Katakana, and basic Kanji for the N5 level.',
    linkedHabitId: null,
    modules: [ 
        { id: 'j1', name: 'Master Hiragana', status: 'completed', verified: true, source: 'user' },
        { id: 'j2', name: 'Master Katakana', status: 'completed', verified: true, source: 'user' },
        { id: 'j3', name: 'Learn 50 Basic Kanji', status: 'pending', verified: false, source: 'user' },
        { id: 'j4', name: 'Basic Grammar Patterns', status: 'pending', verified: false, source: 'user' },
    ],
  },
  { id: 'SideProject', title: 'Launch Side Project API', emoji: '🚀', statusText: 'Planning Phase', progressPercent: 10, category: 'Coding', description: 'In the initial planning stages for the new side project API.', type: 'Generic', linkedHabitId: null },
];

// --- SERVICE CLIENTS INITIALIZATION ---

// Gemini AI Client
const GEMINI_API_KEY = process.env.API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Supabase Client
// In a real application, these values would come from secure environment variables.
// The user's prompt states to "assume supabase is already initialized",
// so we'll create a placeholder client here to make the code runnable and demonstrate its usage.
const supabaseUrl = 'https://placeholder.supabase.co';
const supabaseKey = 'placeholder-anon-key';
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);


async function generateAIQuestionForModule(goalTitle, moduleName) {
  if (!ai) {
    console.warn("Gemini API key not configured. Returning a default question.");
    return "AI is not available. In your own words, what was the key takeaway from this module?";
  }
  try {
    const prompt = `You are an AI assistant for GoalMate, a goal tracking app. A user is trying to verify their understanding of a learning module for their goal.
Goal Title: "${goalTitle}"
Module Name: "${moduleName}"
Please generate one simple, open-ended conceptual question about the content of "${moduleName}" suitable for a beginner. The question should encourage a short text-based answer (1-3 sentences). Do not ask for code. Focus on understanding the core concept.
Example: If module is "Introduction to JSX", a good question might be "In your own words, what is JSX and why is it useful in React?"`;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17",
        contents: prompt,
    });
    return response.text?.trim() || "Could not generate a question. Please describe what you learned in this module.";
  } catch (error) {
    console.error("Error generating AI question:", error);
    return "Error fetching question. How would you summarize this module's main idea?";
  }
}

async function getAIAcknowledgment(goalTitle, moduleName, question, userAnswer) {
  if (!ai) {
     console.warn("Gemini API key not configured. Returning a default acknowledgment.");
    return "Great effort! Thanks for sharing your thoughts.";
  }
  try {
    const prompt = `You are an AI assistant for GoalMate, a goal tracking app. A user is verifying a learning module.
Goal: "${goalTitle}"
Module: "${moduleName}"
They were asked: "${question}"
Their answer: "${userAnswer}"
Please provide a brief, positive, and encouraging acknowledgment of their effort (1-2 sentences). Do NOT grade or confirm the correctness of their answer. Just offer encouragement for taking the step to explain their understanding.
Examples:
"Thanks for articulating your thoughts on that! Keep up the great work on your learning journey."
"Well done for putting your learning into words! That's a key step."`;
    
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17",
        contents: prompt,
    });
    return response.text?.trim() || "Thanks for your input! Keep learning!";
  } catch (error) {
    console.error("Error generating AI acknowledgment:", error);
    return "Thanks for your response! Keep pushing forward!";
  }
}

async function getWeeklyQuest(userGoals) {
  if (!ai) {
    return { title: "Tech Offline!", description: "Our AI is taking a break. How about you set a small step for one of your goals yourself this week?", relatedGoal: "" };
  }
  if (!userGoals || userGoals.length === 0) {
    return { title: "No Goals Yet!", description: "Add a goal to get your first weekly quest!", relatedGoal: "" };
  }

  const activeGoalTitles = userGoals.filter(g => (g.progressPercent || 0) < 100).map(g => g.title).join(', ');
  if (!activeGoalTitles) {
    return { title: "All Goals Conquered!", description: "Looks like you've completed all your current goals! Amazing! Add a new one for a fresh quest.", relatedGoal: "" };
  }

  try {
    const prompt = `You are a motivating AI assistant for GoalMate, a goal-setting app focused on coding and language learning.
A user has the following active goals: ${activeGoalTitles}.
Pick ONE of these goals. Create a specific, challenging but achievable 'weekly quest' (1-2 sentences) that the user can work on this week. The quest should be encouraging.

Output the quest in the following format EXACTLY:
Quest Title: [A short, catchy title for the quest, e.g., "React Component Challenge"]
Description: [The 1-2 sentence description of the quest, e.g., "Build and style 3 new React components from scratch this week. You can do it!"]
Related Goal: [The exact title of the goal you picked from the list]

Example:
If goals are "Learn Python, Master Hiragana", you might output:
Quest Title: Python Function Wizard
Description: Write and test 5 new Python functions that solve small problems. Every function is a step forward!
Related Goal: Learn Python
`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
    });
    
    const text = response.text?.trim();
    if (!text) {
        throw new Error("Empty response from AI.");
    }

    const titleMatch = text.match(/Quest Title: (.*)/);
    const descriptionMatch = text.match(/Description: (.*)/);
    const relatedGoalMatch = text.match(/Related Goal: (.*)/);

    if (titleMatch && descriptionMatch && relatedGoalMatch) {
      return {
        title: titleMatch[1].trim(),
        description: descriptionMatch[1].trim(),
        relatedGoal: relatedGoalMatch[1].trim()
      };
    } else {
      console.error("Failed to parse AI response for quest:", text);
      const foundGoal = userGoals.find(g => text.toLowerCase().includes(g.title.toLowerCase()));
      return { title: "Weekly Quest Suggestion", description: text, relatedGoal: foundGoal ? foundGoal.title : "General" };
    }

  } catch (error) {
    console.error("Error generating weekly quest:", error);
    const activeGoals = userGoals.filter(g => (g.progressPercent || 0) < 100);
    const randomGoal = activeGoals.length > 0 ? activeGoals[Math.floor(Math.random() * activeGoals.length)] : null;
    const relatedGoalTitle = randomGoal ? randomGoal.title : "";

    return { title: "Quest Idea!", description: `Focus on making a solid leap forward in one of your goals this week. ${randomGoal ? `Perhaps something for '${randomGoal.title}'?` : "You've got this!"}`, relatedGoal: relatedGoalTitle };
  }
}

async function getAIChatReply(buddyName, userMessage) {
  if (!ai) {
    console.warn("Gemini API key not configured. Returning a default reply.");
    return "Got it, thanks for the update!";
  }
  try {
    const prompt = `You are ${buddyName}, a friendly and supportive accountability buddy on the GoalMate app. Your friend just sent you this message. Write a short, casual, and encouraging reply (1-2 sentences). Be brief and natural, like a real text message.
Friend's message: "${userMessage}"`;
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
    });
    return response.text?.trim() || "Sounds good!";
  } catch (error) {
    console.error("Error getting AI chat reply:", error);
    return "Cool, thanks for letting me know.";
  }
}

// Stub function for AI-driven module generation
async function generateAIModulesForGoal(goalTitle, goalDescription) {
  console.log(`Attempting to generate AI modules for: "${goalTitle}"`);
  if (!ai) {
    console.warn("Gemini API key not configured. Returning sample modules.");
    // Return a predefined sample structure if AI is not available
    return [
      { id: 'ai_m1_' + Date.now(), name: `AI Suggested: Introduction to ${goalTitle}`, status: 'pending', verified: false, source: 'AI', description: `An AI-generated module covering the basics of ${goalTitle}.` },
      { id: 'ai_m2_' + Date.now(), name: `AI Suggested: Core Concepts of ${goalTitle}`, status: 'pending', verified: false, source: 'AI', description: `An AI-generated module exploring key concepts related to ${goalTitle}.` },
      { id: 'ai_m3_' + Date.now(), name: `AI Suggested: Practical Application for ${goalTitle}`, status: 'pending', verified: false, source: 'AI', description: `An AI-generated module focused on applying ${goalTitle}.` },
    ];
  }

  try {
    const prompt = `You are an AI curriculum designer for GoalMate, a goal-setting app for coding and language learning.
A user wants to achieve the following goal:
Goal Title: "${goalTitle}"
Goal Description: "${goalDescription || 'Not provided.'}"

Based on this goal, please suggest 3-5 learning modules. Each module should have a concise name (3-7 words) and a brief description (1-2 sentences) of what it might cover.
Format your response as a JSON array of objects. Each object should have "name" and "description" properties.

Example for goal "Learn to Bake Sourdough Bread":
[
  { "name": "Understanding Sourdough Starters", "description": "Learn how to create, feed, and maintain a healthy sourdough starter." },
  { "name": "Basic Dough Mixing and Kneading", "description": "Master the fundamental techniques for mixing and developing sourdough dough." },
  { "name": "Shaping, Proofing, and Scoring Loaves", "description": "Understand how to properly shape, proof, and score your dough before baking." },
  { "name": "Baking Techniques for Sourdough", "description": "Explore different baking methods, including Dutch ovens and baking stones." }
]
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    
    const suggestedModules = JSON.parse(jsonStr);

    if (Array.isArray(suggestedModules)) {
      return suggestedModules.map((mod, index) => ({
        id: `ai_m${index}_${Date.now()}`, // Generate a unique ID
        name: mod.name,
        description: mod.description, // Store AI-provided description
        status: 'pending',
        verified: false,
        source: 'AI'
      }));
    } else {
        console.error("AI response for modules was not a JSON array:", suggestedModules);
        throw new Error("AI response for modules was not in the expected format.");
    }

  } catch (error) {
    console.error("Error generating AI modules:", error);
    // Fallback to sample modules in case of an error
    return [
      { id: 'ai_err_m1_' + Date.now(), name: "AI Error: Could not generate introduction", status: 'pending', verified: false, source: 'AI', description: "There was an issue generating modules with AI." },
      { id: 'ai_err_m2_' + Date.now(), name: "AI Error: Could not generate core concepts", status: 'pending', verified: false, source: 'AI', description: "Please try again later or add modules manually." },
    ];
  }
}


const AIVerificationModal = ({ goal, module, onClose, onModuleVerified, onModuleSelfCompleted }) => {
  const [aiQuestion, setAiQuestion] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (module && goal) {
      setIsLoadingQuestion(true);
      setAiFeedback('');
      setError('');
      setUserAnswer('');
      generateAIQuestionForModule(goal.title, module.name)
        .then(setAiQuestion)
        .catch(err => {
          console.error(err);
          setError('Failed to load AI question. You can still self-complete.');
          setAiQuestion('Could not load question. How would you summarize this module?');
        })
        .finally(() => setIsLoadingQuestion(false));
    }
  }, [goal, module]);

  const handleSubmitToAI = async (e) => {
    e.preventDefault();
    if (!userAnswer.trim()) {
      setError('Please provide an answer to demonstrate your understanding.');
      return;
    }
    setIsSubmittingAnswer(true);
    setError('');
    try {
      awardXp(10);
      const feedback = await getAIAcknowledgment(goal.title, module.name, aiQuestion, userAnswer);
      setAiFeedback(feedback);
      setTimeout(() => {
        onModuleVerified(module.id); 
        onClose();
      }, 2800); 
    } catch (err) {
      console.error("Error in AI submission process:", err);
      setError('Failed to get AI feedback. You can self-complete, or try again.');
      setAiFeedback("There was an issue connecting with the AI. Your progress for this attempt wasn't saved for AI verification.");
       setTimeout(() => { 
        setAiFeedback(''); 
        setError('You can try submitting again or choose to self-complete.');
       }, 4000);
    } finally {
        // Keep submitting true while feedback is shown / modal closes
    }
  };

  const handleSelfComplete = () => {
    setAiFeedback('Marked as self-completed. Keep up the great work!');
    setIsSubmittingAnswer(true); 
    setTimeout(() => {
        onModuleSelfCompleted(module.id);
        onClose();
    }, 1800);
  };

  if (!module) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ai-verification-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="modal-close-btn" aria-label="Close dialog" disabled={isSubmittingAnswer}>&times;</button>
        <h2 id="ai-verification-title">
            <div className="mascot-placeholder modal-mascot-peek">M!</div>
            Verify: {module.name}
        </h2>
        
        {isLoadingQuestion && <div className="loading-spinner-container"><div className="loading-spinner"></div><p>Loading AI Question...</p></div>}
        
        {!isLoadingQuestion && aiQuestion && !aiFeedback && (
          <form onSubmit={handleSubmitToAI}>
            <p className="ai-question-text" id="ai-q-text"><strong>AI Question:</strong> {aiQuestion}</p>
            {error && <p className="error-message-box" role="alert">{error}</p>}
            <div className="form-group">
              <label htmlFor="userAnswerAI">Your Answer:</label>
              <textarea 
                id="userAnswerAI" 
                value={userAnswer} 
                onChange={(e) => setUserAnswer(e.target.value)} 
                rows={4} 
                className="form-control"
                placeholder="Share your understanding..."
                aria-describedby="ai-q-text"
                disabled={isSubmittingAnswer}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary" disabled={isSubmittingAnswer || !userAnswer.trim()}>
                {isSubmittingAnswer ? 'Processing...' : 'Submit to AI & Complete (+10 XP)'}
              </button>
              <button type="button" onClick={handleSelfComplete} className="btn btn-secondary" disabled={isSubmittingAnswer}>
                Mark as Self-Completed (No XP)
              </button>
            </div>
          </form>
        )}
        {aiFeedback && !isLoadingQuestion && (
          <div className="ai-feedback-section">
            <p>{aiFeedback}</p>
            {isSubmittingAnswer && <p>Updating module status...</p>}
          </div>
        )}
      </div>
    </div>
  );
};


const LinkHabitModal = ({ onClose, onLinkHabit, onCreateAndLinkHabit }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content link-habit-modal" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="modal-close-btn" aria-label="Close dialog">&times;</button>
                <h2>Link a Daily Habit</h2>
                <p>Connect this goal to a daily action to build momentum.</p>
                <div className="habit-list">
                    {mockTrackersData.map(habit => (
                        <div key={habit.id} className="habit-list-item" onClick={() => onLinkHabit(habit.id)}>
                            <span className="habit-list-item-emoji">{habit.emoji}</span>
                            <span className="habit-list-item-name">{habit.name}</span>
                        </div>
                    ))}
                </div>
                <button onClick={onCreateAndLinkHabit} className="btn btn-secondary btn-block" style={{marginTop: '15px'}}>
                    + Create New Habit
                </button>
            </div>
        </div>
    );
};

const LinkedHabitPreview = ({ habit }) => {
    if (!habit) return null;
    return (
        <div className="linked-habit-preview">
            <h4>Linked Daily Habit</h4>
            <div className="linked-habit-content">
                <span className="linked-habit-emoji">{habit.emoji}</span>
                <span className="linked-habit-name">{habit.name}</span>
                <div className="linked-habit-streak" title={`Current Streak: ${habit.currentStreak} days`}>
                    🔥 {habit.currentStreak || 0}
                </div>
            </div>
        </div>
    );
};

const GoalProgressViewPage = ({ navigateTo, isEmbedded, goalId, onGoalUpdate: notifyParentOfGoalChange }) => {
    const [goal, setGoal] = useState(null);
    const [verifyingModule, setVerifyingModule] = useState(null); 
    const [isAIVerificationModalOpen, setIsAIVerificationModalOpen] = useState(false);
    const [isLinkHabitModalOpen, setIsLinkHabitModalOpen] = useState(false);
    const [_, forceViewUpdateCounter] = useState(0); 

    const calculateLocalGoalProgress = useCallback((currentGoal) => {
        if (!currentGoal) return null;
        const progressDetails = calculateOverallProgressDisplay(currentGoal);
        return { ...currentGoal, progressPercent: progressDetails.percent, statusText: progressDetails.text };
    }, []);

    const forceUpdate = () => forceViewUpdateCounter(c => c + 1);

    useEffect(() => {
      const foundGoal = mockGoalsData.find(g => g.id === goalId);
      if (foundGoal) {
        setGoal(calculateLocalGoalProgress(foundGoal));
      } else {
        setGoal({ title: "Goal Not Found", id: goalId || "N/A", emoji: '❓', category: "Error", statusText:"Could not load goal.", progressPercent: 0, description: "This goal could not be found." });
      }
    }, [goalId, calculateLocalGoalProgress, _]);

    const updateGlobalAndLocalGoal = (updatedGoalData) => {
        const globalGoalIndex = mockGoalsData.findIndex(g => g.id === updatedGoalData.id);
        if (globalGoalIndex !== -1) {
            mockGoalsData[globalGoalIndex] = { ...mockGoalsData[globalGoalIndex], ...updatedGoalData };
        }
        if (notifyParentOfGoalChange) {
            notifyParentOfGoalChange(updatedGoalData); 
        }
        forceUpdate();
    };

    const handleModuleVerified = (moduleId) => {
        if (!goal || !goal.modules) return;
        const updatedModules = goal.modules.map(m => 
            m.id === moduleId ? { ...m, status: 'completed', verified: true } : m
        );
        updateGlobalAndLocalGoal({ ...goal, modules: updatedModules });
    };

    const handleModuleSelfCompleted = (moduleId) => {
        if (!goal || !goal.modules) return;
        const updatedModules = goal.modules.map(m => 
            m.id === moduleId ? { ...m, status: 'completed', verified: false } : m
        );
        updateGlobalAndLocalGoal({ ...goal, modules: updatedModules });
    };
    
    const openVerificationModal = (moduleToVerify) => {
        setVerifyingModule(moduleToVerify);
        setIsAIVerificationModalOpen(true);
    };

    const closeVerificationModal = () => {
        setVerifyingModule(null);
        setIsAIVerificationModalOpen(false);
        forceUpdate(); 
    };

    const handleLinkHabit = (habitId) => {
        updateGlobalAndLocalGoal({ ...goal, linkedHabitId: habitId });
        setIsLinkHabitModalOpen(false);
    };

    const handleCreateAndLinkHabit = () => {
        const newHabitName = prompt("Enter the name for your new daily habit:");
        if (newHabitName) {
            const newHabit = {
                id: 'h' + Date.now(),
                name: newHabitName,
                emoji: '💡',
                goalDescription: 'A new daily habit to build momentum!',
                currentStreak: 0,
                longestStreak: 0,
                frequency: 'Daily',
                color: 'var(--color-primary)',
                streakFreezes: { remaining: 1, total: 1 },
                buddyProgress: 0,
                logs: []
            };
            mockTrackersData.push(newHabit);
            handleLinkHabit(newHabit.id);
        }
    };
    
    const linkedHabit = goal?.linkedHabitId ? mockTrackersData.find(t => t.id === goal.linkedHabitId) : null;


    if (!goal) {
        return <div className="loading-spinner-container"><div className="loading-spinner"></div><p>Loading goal details...</p></div>;
    }

    const isLearningGoal = goal.type === 'Learning' && goal.modules;
    const allModulesFinalized = isLearningGoal ? goal.modules.every(m => m.status === 'completed') : false;
    const canFinalizeGoal = isLearningGoal ? allModulesFinalized : (goal.progressPercent === 100);


    return (
      <>
        <div className={!isEmbedded ? "page-container" : "embedded-page-content goal-progress-view-page"}>
          {!isEmbedded && <AppNavbar navigateTo={navigateTo} />}
          <header className="page-header">
            <h1>Goal: {goal.emoji} {goal.title}</h1>
            <p>Category: {goal.category} | Status: {goal.statusText || (goal.progressPercent === 100 ? 'Completed!' : 'In Progress')}</p>
          </header>
          <div className={!isEmbedded ? "page-content" : "goal-progress-content-area page-content-inner"}>
            <p>Current Progress: <strong>{goal.progressPercent || 0}%</strong></p>
            <div className="goal-card-progress-bar-container" style={{marginBottom: '20px', height: '20px'}}>
              <div 
                className="goal-card-progress-bar" 
                style={{ width: `${goal.progressPercent || 0}%`, height: '100%' }}
                role="progressbar"
                aria-valuenow={goal.progressPercent || 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Goal progress: ${goal.progressPercent || 0}%`}
              >
                 {(goal.progressPercent || 0) > 10 && `${goal.progressPercent || 0}%`}
              </div>
            </div>
            
            <LinkedHabitPreview habit={linkedHabit} />
            
            {isLearningGoal ? (
              <section className="goal-modules-section">
                <h2>Modules</h2>
                {goal.modules.length === 0 && <p>No modules defined for this goal yet.</p>}
                <ul className="goal-modules-list">
                  {goal.modules.map(module => (
                    <li key={module.id} className={`goal-module-item status-${module.status} verified-${module.verified} source-${module.source || 'user'}`}>
                      <span className="module-status-icon" aria-hidden="true">
                        {module.verified ? '✅' : module.status === 'completed' ? '☑️' : '◻️'}
                      </span>
                      <span className="module-name">
                        {module.name}
                        {module.source === 'AI' && <span title="AI Generated Module" style={{fontSize: '0.7rem', marginLeft:'5px', color: 'var(--color-accent2)'}}>🤖</span>}
                      </span>
                      {module.description && module.source === 'AI' && <p style={{fontSize: '0.8rem', color: 'var(--color-text-muted)', flexBasis: '100%', marginLeft: '25px'}}>{module.description}</p> }

                      <div className="module-actions">
                        {module.status === 'pending' && (
                          <>
                            <button onClick={() => handleModuleSelfCompleted(module.id)} className="btn btn-sm btn-success">I did it!</button>
                            <button onClick={() => alert("Upload screenshot placeholder.")} className="btn btn-sm btn-secondary">Upload Proof</button>
                            <button onClick={() => openVerificationModal(module)} className="btn btn-sm btn-primary">
                              Verify with AI
                            </button>
                          </>
                        )}
                        {module.status === 'completed' && !module.verified && (
                           <button onClick={() => openVerificationModal(module)} className="btn btn-sm btn-secondary">
                             Re-verify with AI
                           </button>
                        )}
                        {module.verified && <span className="module-verified-text">AI Verified</span>}
                        {module.status === 'completed' && !module.verified && <span className="module-verified-text">Self-Completed</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <div className="progress-visualization-placeholder" style={{minHeight: '150px', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '20px 0', padding: '20px', textAlign: 'center'}}>
                <h4>Check-in History & Milestones</h4>
                <p style={{color: 'var(--color-text-muted)'}}><em>(Detailed check-in log, notes, and milestone tracking will appear here.)</em></p>
                <button className="btn btn-success" style={{marginTop: '15px'}} onClick={() => alert("Log new check-in!")}>Log New Check-in</button>
              </div>
            )}

            <div style={{display: 'flex', gap: '10px', marginTop: '30px', flexWrap: 'wrap'}}>
              <button onClick={() => navigateTo('mainHome', { activeView: 'goalEdit', goalId: goal.id })} className="btn btn-secondary">Edit Goal Details</button>
              <button 
                  onClick={() => {
                      alert(`Goal '${goal.title}' finalized! Congratulations!`); 
                      const updatedFinalizedGoal = {
                          ...goal,
                          statusText: "Completed & Finalized!",
                          progressPercent: 100,
                      };
                      updateGlobalAndLocalGoal(updatedFinalizedGoal);
                      navigateTo('mainHome', { activeView: 'milestoneGoals' });
                  }} 
                  className="btn btn-primary"
                  disabled={!canFinalizeGoal}
                  title={!canFinalizeGoal ? (isLearningGoal ? "All modules must be completed (either self-completed or AI-verified) to finalize." : "Goal must be 100% complete to finalize.") : "Finalize this goal"}
              >
                  {isLearningGoal 
                    ? (canFinalizeGoal ? 'Finalize Learning Goal' : 'Complete All Modules First') 
                    : (goal.progressPercent === 100 ? 'Finalize Goal Completion' : 'Mark as 100% Complete')}
              </button>
               <button onClick={() => setIsLinkHabitModalOpen(true)} className="btn btn-info">
                {linkedHabit ? 'Change Linked Habit' : 'Link a Daily Habit'}
              </button>
            </div>
            <button onClick={() => navigateTo('mainHome', { activeView: 'milestoneGoals' })} className="btn btn-outline-light" style={{marginTop: '20px'}}>Back to All Milestone Goals</button>
          </div>
        </div>
        {isAIVerificationModalOpen && verifyingModule && goal && (
          <AIVerificationModal 
            goal={goal}
            module={verifyingModule} 
            onClose={closeVerificationModal} 
            onModuleVerified={handleModuleVerified}
            onModuleSelfCompleted={handleModuleSelfCompleted}
          />
        )}
        {isLinkHabitModalOpen && (
             <LinkHabitModal 
                onClose={() => setIsLinkHabitModalOpen(false)}
                onLinkHabit={handleLinkHabit}
                onCreateAndLinkHabit={handleCreateAndLinkHabit}
             />
        )}
      </>
    );
};


const MainHomePage = ({ navigateTo, activeView: initialActiveView = 'dashboard' }) => {
  const [currentView, setCurrentView] = useState(initialActiveView);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(true); 

  useEffect(() => {
    setCurrentView(initialActiveView);
  }, [initialActiveView]);
  
  // This effect will apply the dark mode class on initial load and when it changes
  useEffect(() => {
    document.body.classList.toggle('dark-mode-active', !!mockUserProfile.darkMode);
  }, [mockUserProfile.darkMode]);

  const handleSidebarNavigation = (viewId) => {
    navigateTo('mainHome', { activeView: viewId });
  };
  
  const toggleRightPanel = () => {
    setIsRightPanelCollapsed(!isRightPanelCollapsed);
  };
  
  const { pageProps } = (window as any).__APP_STATE__ || {};
  
  const forceUpdateApp = useState(0)[1];
  const triggerAppUpdate = useCallback(() => forceUpdateApp(c => c+1), []);

  const handleGlobalGoalUpdate = useCallback((updatedGoalData) => {
    const goalIndex = mockGoalsData.findIndex(g => g.id === updatedGoalData.id);
    if (goalIndex !== -1) {
        mockGoalsData[goalIndex] = { ...mockGoalsData[goalIndex], ...updatedGoalData };
        triggerAppUpdate();
    }
  }, [triggerAppUpdate]);

  const handleGlobalTrackerUpdate = useCallback((updatedTrackers) => {
    mockTrackersData = [...updatedTrackers]; 
    triggerAppUpdate();
  }, [triggerAppUpdate]);


  const renderActiveView = () => {
    const commonProps = { navigateTo, isEmbedded: true, onGoalUpdate: handleGlobalGoalUpdate };
    switch (currentView) {
      case 'dashboard': return <MainDashboardContent navigateTo={navigateTo} userGoals={mockGoalsData} />;
      case 'milestoneGoals': return <GoalDashboardPage {...commonProps} />;
      case 'dailyHabits': return <DailyTrackerPage {...commonProps} onTrackerUpdate={handleGlobalTrackerUpdate} />;
      case 'chat': return <ChatPage {...commonProps} />;
      case 'profile': return <ProfilePage {...commonProps} />;
      case 'settings': return <SettingsPage {...commonProps} onAppUpdate={triggerAppUpdate} />;
      case 'createNewGoal': return <CreateNewGoalPage {...commonProps} />;
      case 'goalProgressView': return <GoalProgressViewPage {...commonProps} goalId={pageProps?.goalId} />;
      case 'goalEdit': return <GoalEditPage {...commonProps} goalId={pageProps?.goalId} />;
      case 'notificationsView': return <NotificationsPage {...commonProps} />;
      default: return <MainDashboardContent navigateTo={navigateTo} userGoals={mockGoalsData} />;
    }
  };

  return (
    <div className="main-home-layout">
      <LeftSidebar onNavigate={handleSidebarNavigation} currentView={currentView} />
      <main className="center-content-area">
        {renderActiveView()}
      </main>
      <RightPanel isCollapsed={isRightPanelCollapsed} onToggleCollapse={toggleRightPanel} />
    </div>
  );
};

const CommonEmbeddedPageStructure = ({ title, subtitle, children, isEmbedded, navigateTo, customClassName = "embedded-page-content", headerContent = null, headerActions = null }) => (
    <div className={!isEmbedded ? "page-container" : customClassName}>
        {!isEmbedded && <AppNavbar navigateTo={navigateTo} />}
        <header className="page-header">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
            {headerContent && <div className="page-header-extra">{headerContent}</div>}
            {headerActions && <div className="page-header-actions">{headerActions}</div>}
        </header>
        <div className={!isEmbedded ? "page-content" : "page-content-inner"}>
            {children}
        </div>
    </div>
);

const GoalDashboardPage = ({ navigateTo, isEmbedded, onGoalUpdate }) => {
  const [goalsToDisplay, setGoalsToDisplay] = useState(() => JSON.parse(JSON.stringify(mockGoalsData)));

  useEffect(() => {
    setGoalsToDisplay(JSON.parse(JSON.stringify(mockGoalsData)));
  }, [mockGoalsData, onGoalUpdate]);


  const handleViewDetails = (goalId) => {
    navigateTo('mainHome', { activeView: 'goalProgressView', goalId: goalId });
  };

  const handleEditGoal = (goalId) => {
    navigateTo('mainHome', { activeView: 'goalEdit', goalId: goalId });
  };

  return (
    <div className={!isEmbedded ? "page-container" : "embedded-page-content goal-dashboard-page"}>
      {!isEmbedded && <AppNavbar navigateTo={navigateTo} />}
      <header className="page-header">
        <h1>Milestone Goals</h1>
        <p>Your long-term ambitions. Break them down, track progress, and achieve great things.</p>
      </header>
      <div className={!isEmbedded ? "page-content" : "goals-content-area"}>
        {goalsToDisplay.length === 0 ? (
          <div className="goals-empty-state">
            <div className="mascot-placeholder empty-state-mascot">Mascot Here!</div>
            <span className="goals-empty-icon" aria-hidden="true">🎯</span>
            <h2>Your Goal Slate is Clean!</h2>
            <p>Ready to embark on a new challenge? Let's set your first goal and make things happen.</p>
            <button onClick={() => navigateTo('mainHome', { activeView: 'createNewGoal' })} className="btn btn-primary btn-lg">
              Set Your First Goal
            </button>
          </div>
        ) : (
          <div className="goals-grid staggered-animation-container">
            {goalsToDisplay.map(goal => {
              const progressDisplay = calculateOverallProgressDisplay(goal);
              return (
                <div key={goal.id} className="goal-card">
                  <div className="goal-card-header">
                    <span className="goal-card-icon" aria-hidden="true">{goal.emoji || '🌟'}</span>
                    <h3>{goal.title}</h3>
                  </div>
                  {goal.category && <span className="goal-card-category">{goal.category}</span>}
                  <p className="goal-card-status">{progressDisplay.text}</p>
                  {typeof progressDisplay.percent === 'number' && (
                    <div className="goal-card-progress-bar-container">
                      <div 
                        className="goal-card-progress-bar" 
                        style={{ width: `${progressDisplay.percent}%` }}
                        role="progressbar"
                        aria-valuenow={progressDisplay.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progress: ${progressDisplay.percent}%`}
                      >
                      </div>
                    </div>
                  )}
                  <div className="goal-card-actions">
                    <button onClick={() => handleViewDetails(goal.id)} className="btn btn-sm btn-secondary">View Details</button>
                    <button onClick={() => handleEditGoal(goal.id)} className="btn btn-sm btn-outline-light">Edit</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {goalsToDisplay.length > 0 && (
           <div className="add-new-goal-button-container">
            <button 
                onClick={() => navigateTo('mainHome', { activeView: 'createNewGoal' })} 
                className="btn btn-primary btn-lg"
            >
                <span aria-hidden="true" style={{marginRight: '8px'}}>➕</span> Add New Goal
            </button>
           </div>
        )}
      </div>
    </div>
  );
};


const CreateNewGoalPage = ({ navigateTo, isEmbedded }) => (
  <div className={!isEmbedded ? "page-container" : "embedded-page-content"}>
     {!isEmbedded && <AppNavbar navigateTo={navigateTo} />}
    <header className="page-header">
      <h1>Create New Goal</h1>
    </header>
    <div className={!isEmbedded ? "page-content" : "page-content-inner"}>
      {/* 
        Future Enhancement Idea:
        <button onClick={async () => {
          const goalTitle = (document.getElementById('goalTitle') as HTMLInputElement)?.value;
          const goalDescription = (document.getElementById('goalDescription') as HTMLInputElement)?.value;
          if (goalTitle) {
            const aiModules = await generateAIModulesForGoal(goalTitle, goalDescription);
            console.log("AI Suggested Modules:", aiModules);
            // Here, you would update state to display these modules for user selection/confirmation
            alert("AI suggested modules! Check console. (UI to display them would be next step)");
          } else {
            alert("Please enter a goal title first.");
          }
        }} className="btn btn-info" style={{marginBottom: '15px'}}>
          ✨ Get AI Module Suggestions (Experimental)
        </button> 
      */}
      <form onSubmit={(e) => {e.preventDefault(); navigateTo('mainHome', { activeView: 'milestoneGoals' });}} className="goal-form">
        <div className="form-group">
          <label htmlFor="goalTitle">Goal Title</label>
          <input type="text" id="goalTitle" required className="form-control"/>
        </div>
        <div className="form-group">
          <label htmlFor="goalDescription">Description</label>
          <textarea id="goalDescription" rows={3} className="form-control"></textarea>
        </div>
         <div className="form-group">
          <label htmlFor="goalType">Goal Category</label>
          <select id="goalType" className="form-control">
            <option value="Coding">Coding</option>
            <option value="Language Learning">Language Learning</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="goalTimeline">Target Date</label>
          <input type="date" id="goalTimeline" className="form-control"/>
        </div>
        <div className="form-group">
          <label htmlFor="goalTags">Tags (comma separated)</label>
          <input type="text" id="goalTags" placeholder="e.g., react, japanese" className="form-control"/>
        </div>
         <div className="form-group">
          <label htmlFor="goalEmoji">Emoji (Optional)</label>
          <input type="text" id="goalEmoji" placeholder="e.g., 💻 or 🇯🇵" maxLength={2} className="form-control" style={{maxWidth: '150px'}}/>
        </div>
        <button type="submit" className="btn btn-primary btn-block">Create Goal</button>
        <button type="button" onClick={() => navigateTo('mainHome', { activeView: 'milestoneGoals' })} className="btn btn-outline-light btn-block" style={{marginTop: '10px'}}>Cancel</button>
      </form>
    </div>
  </div>
);


const GoalEditPage = ({ navigateTo, isEmbedded, goalId }) => {
    const foundGoal = mockGoalsData.find(g => g.id === goalId);
    const goal = foundGoal 
        ? { ...foundGoal } 
        : { 
            title: "New Goal", 
            id: goalId || "N/A", 
            description: "", 
            emoji: '', 
            category: 'Coding', 
            progressPercent: 0, 
            statusText: 'To be started',
            type: 'Learning',
            modules: []
          };

    return (
      <div className={!isEmbedded ? "page-container" : "embedded-page-content goal-edit-page"}>
        {!isEmbedded && <AppNavbar navigateTo={navigateTo} />}
        <header className="page-header">
          <h1>Edit Goal: {goal.emoji} {goal.title}</h1>
        </header>
        <div className={!isEmbedded ? "page-content" : "goal-edit-content-area page-content-inner"}>
           <form onSubmit={(e) => {e.preventDefault(); alert(`Changes to '${goal.title}' saved!`); navigateTo('mainHome', { activeView: 'goalProgressView', goalId: goal.id });}} className="goal-form">
            <div className="form-group">
              <label htmlFor="goalTitle">Goal Title</label>
              <input type="text" id="goalTitle" defaultValue={goal.title} required className="form-control"/>
            </div>
            <div className="form-group">
              <label htmlFor="goalDescription">Description</label>
              <textarea id="goalDescription" rows={4} className="form-control" defaultValue={goal.description || "Add a detailed description for your goal..."}></textarea>
            </div>
            <div className="form-group">
                <label htmlFor="goalTypeEdit">Goal Category</label>
                <select id="goalTypeEdit" defaultValue={goal.category || 'Coding'} className="form-control">
                    <option value="Coding">Coding</option>
                    <option value="Language Learning">Language Learning</option>
                </select>
            </div>
            <div className="form-group">
              <label htmlFor="goalTimeline">Target Date</label>
              <input type="date" id="goalTimeline" className="form-control" defaultValue={new Date().toISOString().split('T')[0]}/>
            </div>
             <div className="form-group">
              <label htmlFor="goalEmoji">Emoji (Optional)</label>
              <input type="text" id="goalEmoji" defaultValue={goal.emoji} placeholder="e.g., 💻 or 💪" maxLength={2} className="form-control" style={{maxWidth: '150px'}}/>
            </div>
            {goal.type !== 'Learning' && <div className="form-group">
              <label htmlFor="goalProgressPercent">Progress (%)</label>
              <input type="number" id="goalProgressPercent" defaultValue={goal.progressPercent || 0} min="0" max="100" className="form-control" style={{maxWidth: '150px'}}/>
            </div>}
            <button type="submit" className="btn btn-primary btn-block">Save Changes</button>
            <button type="button" onClick={() => navigateTo('mainHome', { activeView: 'goalProgressView', goalId: goal.id })} className="btn btn-outline-light btn-block" style={{marginTop: '10px'}}>Cancel</button>
          </form>
        </div>
      </div>
    );
};

const NotificationsPage = ({ navigateTo, isEmbedded }) => ( 
  <div className={!isEmbedded ? "page-container" : "embedded-page-content"}>
    {!isEmbedded && <AppNavbar navigateTo={navigateTo} />}
    <header className="page-header">
      <h1>Notifications</h1>
    </header>
    <div className={!isEmbedded ? "page-content" : "page-content-inner"}>
      <div className="notification-item-placeholder">
        <span>Your buddy Alex just completed 'Components and Props'!</span>
        <button className="btn btn-sm btn-primary">Send Congrats</button>
      </div>
      <div className="notification-item-placeholder">
        <span>Achievement Unlocked: 5-Day Streak for 'Code one problem'!</span>
         <button className="btn btn-sm btn-secondary">View Details</button>
      </div>
    </div>
  </div>
);

const ChatPage = ({ navigateTo, isEmbedded }) => {
    const [activeChat, setActiveChat] = useState(null);
    const [messageInput, setMessageInput] = useState('');
    const [isBuddyTyping, setIsBuddyTyping] = useState(false);

    const initialMockDirectMessages = [
        { 
            id: 'dm1', name: 'Alex Taylor', avatar: '🧑‍💻', type: 'dm', 
            lastMessage: 'Sounds good, let’s sync up tomorrow!', unread: 2, time: '10:32 AM',
            xp: 1100, streak: 5,
            messages: [
                { id: 'm1a', sender: 'Alex Taylor', text: 'Hey! How is the project going?', time: '10:30 AM', type: 'received' },
                { id: 'm1b', sender: 'You', text: 'Pretty good, making progress on the UI.', time: '10:31 AM', type: 'sent' },
                { id: 'm1c', sender: 'Alex Taylor', text: 'Sounds good, let’s sync up tomorrow!', time: '10:32 AM', type: 'received' },
            ]
        },
        { 
            id: 'dm2', name: 'Samira Khan', avatar: '🧑‍🔬', type: 'dm', 
            lastMessage: 'Just finished my vocab for the day!', unread: 0, time: 'Yesterday',
            xp: 980, streak: 12,
            messages: [
                { id: 'm2a', sender: 'Samira Khan', text: 'Just finished my vocab for the day!', time: 'Yesterday', type: 'received' },
            ]
        },
    ];

    const [directMessages, setDirectMessages] = useState(initialMockDirectMessages);
    
    const handleSelectChat = (chat) => {
        setActiveChat(chat);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!messageInput.trim() || !activeChat || isBuddyTyping) return;

        const userMessage = {
            id: `msg-${Date.now()}`,
            sender: 'You',
            text: messageInput,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'sent'
        };
        
        // Update UI immediately with user's message and start typing indicator
        setMessageInput('');
        setIsBuddyTyping(true);
        setDirectMessages(prevDMs => {
            const updatedDMs = prevDMs.map(c => 
                c.id === activeChat.id 
                ? { ...c, messages: [...(c.messages || []), userMessage], lastMessage: userMessage.text, time: userMessage.time }
                : c
            );
            const updatedActiveChat = updatedDMs.find(c => c.id === activeChat.id);
            setActiveChat(updatedActiveChat);
            return updatedDMs;
        });

        // Get AI reply
        const aiReplyText = await getAIChatReply(activeChat.name, userMessage.text);
        
        const aiMessage = {
            id: `reply-${Date.now()}`,
            sender: activeChat.name, 
            text: aiReplyText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'received'
        };

        // Update UI with AI's reply and stop typing indicator
        setIsBuddyTyping(false);
        setDirectMessages(prevDMs => {
            const updatedDMs = prevDMs.map(c => 
                c.id === activeChat.id 
                ? { ...c, messages: [...(c.messages || []), aiMessage], lastMessage: aiMessage.text, time: aiMessage.time }
                : c
            );
            const updatedActiveChat = updatedDMs.find(c => c.id === activeChat.id);
            setActiveChat(updatedActiveChat);
            return updatedDMs;
        });
    };

    const headerActions = (
        <button onClick={() => alert('Find a new buddy!')} className="btn btn-primary">
            <span aria-hidden="true" style={{ marginRight: '8px' }}>➕</span>
            Find Buddy
        </button>
    );

    return (
        <CommonEmbeddedPageStructure
            title="💬 Buddy Chat"
            subtitle="Connect with your accountability buddy."
            isEmbedded={isEmbedded}
            navigateTo={navigateTo}
            customClassName="embedded-page-content chat-page"
            headerActions={headerActions}
        >
            {directMessages.length === 0 ? (
                <div className="chat-empty-state">
                  <div className="mascot-placeholder empty-state-mascot" style={{ width: '80px', height: '80px', margin: '0 auto 15px auto' }}>Mascot!</div>
                    <span className="chat-empty-icon" aria-hidden="true">📬</span>
                    <h2>No Chats Yet!</h2>
                    <p>Find a buddy to get connected.</p>
                </div>
            ) : (
                <div className="chat-layout-container"> 
                    <div className="chat-sidebar"> 
                        <div className="chat-section">
                            <h4>Buddy Chat</h4>
                            <div className="chat-list staggered-animation-container">
                                {directMessages.map(chat => (
                                    <div key={chat.id} className={`chat-list-item ${activeChat?.id === chat.id ? 'active' : ''}`} onClick={() => handleSelectChat(chat)} role="button" tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectChat(chat);}}
                                    >
                                        <span className="chat-avatar" aria-hidden="true">{chat.avatar}</span>
                                        <div className="chat-info">
                                            <span className="chat-name">{chat.name}</span>
                                            <p className="chat-last-message">{chat.lastMessage}</p>
                                        </div>
                                        {chat.unread > 0 && <span className="unread-indicator">{chat.unread}</span>}
                                        <span className="chat-time">{chat.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {activeChat ? (
                        <div className="active-chat-area detailed">
                            <div className="active-chat-header">
                                <span className="chat-avatar small-header-avatar" aria-hidden="true">{activeChat.avatar}</span>
                                <h3 className="chat-title">{activeChat.name}</h3>
                                <div className="buddy-chat-stats">
                                    <span>🔥 {activeChat.streak}</span>
                                    <span>✨ {activeChat.xp} XP</span>
                                </div>
                                <div className="chat-actions-placeholder" onClick={() => alert('More chat options clicked!')} role="button" tabIndex={0} 
                                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') alert('More chat options clicked!');}}
                                >⋮</div>
                            </div>
                            <div className="chat-messages-area" key={activeChat.id}>
                                {(activeChat.messages || []).map(msg => (
                                    <div key={msg.id} className={`message-bubble ${msg.type}`}>
                                        <p className="message-text">{msg.text}</p>
                                        <span className="message-time">{msg.time}</span>
                                    </div>
                                ))}
                                {isBuddyTyping && (
                                    <div className="message-bubble received is-typing">
                                        <div className="typing-indicator">
                                            <span></span><span></span><span></span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <form className="message-input-area" onSubmit={handleSendMessage}>
                                <button type="button" className="message-action-btn" aria-label="Attach file" onClick={() => alert('Attach file clicked')}><span aria-hidden="true">📎</span></button>
                                <textarea 
                                    className="message-input-field" 
                                    placeholder="Type your message..." 
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e as any); }}}
                                />
                                <button type="button" className="message-action-btn" aria-label="Add emoji" onClick={() => alert('Add emoji clicked')}><span aria-hidden="true">😊</span></button>
                                <button type="submit" className="message-send-button" aria-label="Send message" disabled={isBuddyTyping || !messageInput.trim()}>➢</button>
                            </form>
                        </div>
                    ) : (
                        <div className="active-chat-area"> 
                            <div className="active-chat-placeholder">
                                 <div className="mascot-placeholder empty-state-mascot" style={{ width: '80px', height: '80px', margin: '0 auto 15px auto' }}>Mascot!</div>
                                <span className="placeholder-icon" aria-hidden="true">🗨️</span>
                                <p>Select a chat to start messaging</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </CommonEmbeddedPageStructure>
    );
};

const ActivityHeatmap = ({ data }) => {
    const today = new Date();
    const days = [];
    const dateValues = new Map(data.map(d => [d.date, d.count]));

    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        days.push({
            date: dateString,
            count: dateValues.get(dateString) || 0
        });
    }
    
    const getColorLevel = (count) => {
        if (count > 3) return 4;
        if (count > 1) return 3;
        if (count > 0) return 2;
        return 1;
    }

    return (
        <div className="mock-chart-container">
            <h4>Daily Activity Heatmap (Last 30 Days)</h4>
            <div className="activity-heatmap" aria-label="Activity heatmap for the last 30 days">
                {days.map(day => (
                     <div 
                        key={day.date} 
                        className="heatmap-day" 
                        data-level={getColorLevel(day.count)}
                        title={`${day.count} check-in(s) on ${day.date}`}
                     ></div>
                ))}
            </div>
        </div>
    );
};

const XpOverTimeChart = ({ data }) => {
    const chartHeight = 150;
    const chartWidth = 350; // assuming a container width
    const maxXP = Math.max(...data.map(d => d.xp), 0);
    const points = data.map((point, index) => {
        const x = (index / (data.length - 1)) * chartWidth;
        const y = chartHeight - (point.xp / (maxXP || 1)) * chartHeight;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="mock-chart-container">
            <h4>XP Growth (Last 30 Days)</h4>
            <div className="xp-chart-wrapper">
                 <svg className="xp-chart-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet" aria-label="XP Growth Chart">
                    <polyline
                        fill="none"
                        stroke="var(--color-primary)"
                        strokeWidth="2"
                        points={points}
                    />
                 </svg>
            </div>
        </div>
    );
};


const ProfilePage = ({ navigateTo, isEmbedded }) => {
    const userProfile = mockUserProfile;
    const { xp, level } = userProfile;
    const currentLevelXp = LEVEL_THRESHOLDS[level] || 0;
    const nextLevelXp = LEVEL_THRESHOLDS[level + 1] || (currentLevelXp + 150); // Fallback for max level
    const xpIntoLevel = xp - currentLevelXp;
    const xpForNextLevel = nextLevelXp - currentLevelXp;
    const progressPercent = xpForNextLevel > 0 ? (xpIntoLevel / xpForNextLevel) * 100 : 100;
    
    const stats = {
        goalsCompleted: mockGoalsData.filter(g => calculateOverallProgressDisplay(g).percent === 100).length,
        modulesVerified: mockGoalsData.reduce((acc, goal) => {
            return acc + (goal.modules?.filter(m => m.verified).length || 0);
        }, 0),
        longestStreak: Math.max(0, ...mockTrackersData.map(t => t.longestStreak || 0))
    };

    const allBadges = [
        { id: 'first_goal', name: 'Goal Setter', icon: '🎯', description: 'Completed your first goal!', unlocked: stats.goalsCompleted > 0 },
        { id: 'ten_streak', name: 'Streak Starter', icon: '🔥', description: 'Achieved a 10-day streak!', unlocked: stats.longestStreak >= 10 },
        { id: 'verified_pro', name: 'Verified Pro', icon: '✅', description: 'Verified 5 modules with AI!', unlocked: stats.modulesVerified >= 5 },
        { id: 'new_buddy', name: 'Team Player', icon: '🧑‍🤝‍🧑', description: 'Started your journey with a buddy!', unlocked: true }
    ];

    const unlockedBadges = allBadges.filter(b => b.unlocked);
    const lockedBadges = allBadges.filter(b => !b.unlocked);


    return (
        <CommonEmbeddedPageStructure
            title="My Profile" 
            subtitle={null}
            isEmbedded={isEmbedded}
            navigateTo={navigateTo}
            customClassName="embedded-page-content profile-page-layout"
        >
            <div className="profile-header-card">
                <div className="profile-avatar-large-container">
                    <span className="profile-avatar-large" aria-hidden="true">{userProfile.avatar}</span>
                </div>
                <div className="profile-user-info">
                    <h2>{userProfile.name}</h2>
                    <p>Joined: {userProfile.joinDate}</p>
                    <button onClick={() => alert('Open profile edit form!')} className="btn btn-sm btn-secondary">
                       <span aria-hidden="true" style={{marginRight: '5px'}}>✏️</span> Edit Profile
                    </button>
                </div>
                 <div className="mascot-placeholder" style={{width: '70px', height: '70px', fontSize:'0.6rem', alignSelf: 'flex-end'}}>Mascot!</div>
            </div>

            <div className="profile-section-card">
                <h3>Level Progression</h3>
                <div className="xp-progress-bar-container">
                    <div className="xp-progress-bar" style={{width: `${progressPercent}%`}}></div>
                </div>
                <div className="xp-progress-labels">
                    <span>Level {level} ({xp.toLocaleString()} XP)</span>
                    <span>Level {level+1} ({nextLevelXp.toLocaleString()} XP)</span>
                </div>
            </div>

            <div className="profile-section-card">
                <h3>Key Accomplishments</h3>
                <div className="profile-stats-grid">
                    <div className="profile-stat-item">
                        <span className="stat-icon">🏆</span>
                        <span className="stat-value">{stats.goalsCompleted}</span>
                        <span className="stat-label">Goals Completed</span>
                    </div>
                    <div className="profile-stat-item">
                        <span className="stat-icon">✅</span>
                        <span className="stat-value">{stats.modulesVerified}</span>
                        <span className="stat-label">Modules Verified</span>
                    </div>
                    <div className="profile-stat-item">
                        <span className="stat-icon">🔥</span>
                        <span className="stat-value">{stats.longestStreak}</span>
                        <span className="stat-label">Longest Streak</span>
                    </div>
                </div>
            </div>
            
             <div className="profile-section-card">
                <h3>Unlocked Perks</h3>
                 {userProfile.unlockedPerks.length > 0 ? (
                    <ul className="unlocked-perks-list">
                      {userProfile.unlockedPerks.map(perk => (
                        <li key={perk.id}>✅ {perk.name}</li>
                      ))}
                    </ul>
                ) : <p>Keep earning XP to unlock new features!</p>}
             </div>
             
            <div className="profile-section-card">
                <h3>🏅 Badges</h3>
                {allBadges.length > 0 ? (
                    <div className="profile-badges-grid">
                        {unlockedBadges.map(badge => (
                            <div key={badge.id} className="profile-badge unlocked" title={`${badge.name}: ${badge.description}`}>
                                <span className="badge-icon">{badge.icon}</span>
                                <span className="badge-name">{badge.name}</span>
                            </div>
                        ))}
                        {lockedBadges.map(badge => (
                             <div key={badge.id} className="profile-badge locked" title={`${badge.name}: ${badge.description}`}>
                                <span className="badge-icon">❓</span>
                                <span className="badge-name">{badge.name}</span>
                            </div>
                        ))}
                    </div>
                ) : <p>Complete goals and build streaks to earn badges!</p>}
            </div>
            
            <div className="profile-progress-trends profile-section-card">
                <h3>📊 Progress Trends</h3>
                <div className="charts-section">
                    <ActivityHeatmap data={mockCheckinsLog} />
                    <XpOverTimeChart data={mockXpLog} />
                </div>
            </div>
            
        </CommonEmbeddedPageStructure>
    );
};


const SettingsPage = ({ navigateTo, isEmbedded, onAppUpdate }) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const user = mockUserProfile;
  const canUseDarkMode = user.xp >= UNLOCKABLES.find(u => u.id === 'dark_mode').xpRequired;

  const handleLogout = () => {
    alert("Logging out...");
    navigateTo('welcome');
  };
  
  const handleDarkModeToggle = (e) => {
    const isEnabled = e.target.checked;
    user.darkMode = isEnabled;
    document.body.classList.toggle('dark-mode-active', isEnabled);
    onAppUpdate(); // Force a rerender of the parent to reflect change immediately
  };

  return (
    <CommonEmbeddedPageStructure
      title="⚙️ Fine-Tune Your Experience"
      subtitle="Manage your account, preferences, and more."
      isEmbedded={isEmbedded}
      navigateTo={navigateTo}
      customClassName="embedded-page-content settings-page"
    >
      <div className="settings-category">
        <h3><span className="setting-category-icon" aria-hidden="true">👤</span> Account</h3>
        <div className="settings-item">
          <label htmlFor="editProfile">Profile Information</label>
          <button id="editProfile" onClick={() => navigateTo('mainHome', { activeView: 'profile' })} className="btn btn-sm btn-secondary">Edit Profile</button>
        </div>
        <div className="settings-item">
          <label htmlFor="changePassword">Password</label>
          <button id="changePassword" onClick={() => alert('Open change password modal/form!')} className="btn btn-sm btn-secondary">Change Password</button>
        </div>
      </div>

      <div className="settings-category">
        <h3><span className="setting-category-icon" aria-hidden="true">🔔</span> Notifications</h3>
        <div className="settings-item">
          <label htmlFor="enableNotifications">Enable Email Notifications</label>
          <label className="switch-toggle">
            <input 
              type="checkbox" 
              id="enableNotifications"
              checked={notificationsEnabled}
              onChange={() => setNotificationsEnabled(!notificationsEnabled)}
            />
            <span className="slider round"></span>
          </label>
        </div>
        <div className="settings-item">
          <label>Notification Frequency</label>
          <select className="form-control setting-control-placeholder" style={{maxWidth: '200px'}}>
            <option>Daily Digest</option>
            <option>Instant</option>
            <option>Important Only</option>
          </select>
        </div>
      </div>

      <div className="settings-category">
        <h3><span className="setting-category-icon" aria-hidden="true">🎨</span> Appearance</h3>
        <div className="settings-item">
          <label htmlFor="darkModeToggle">Dark Mode</label>
          <div className="dark-mode-toggle-wrapper" title={!canUseDarkMode ? "Reach 100 XP to unlock Dark Mode!" : "Toggle Dark Mode"}>
            <label className="switch-toggle">
              <input 
                type="checkbox" 
                id="darkModeToggle"
                checked={user.darkMode}
                onChange={handleDarkModeToggle}
                disabled={!canUseDarkMode}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>
      </div>
      
      <div className="settings-category">
        <h3><span className="setting-category-icon" aria-hidden="true">🛡️</span> Privacy & Data</h3>
         <div className="settings-item">
          <label htmlFor="dataExport">Export Your Data</label>
          <button id="dataExport" onClick={() => alert('Data export process initiated!')} className="btn btn-sm btn-outline-light">Request Data Export</button>
        </div>
         <div className="settings-item">
          <label htmlFor="deleteAccount">Delete Account</label>
          <button id="deleteAccount" onClick={() => {if(confirm('Are you sure you want to delete your account? This action cannot be undone.')) {alert('Account deletion process initiated.'); handleLogout();}}} className="btn btn-sm btn-danger">Delete My Account</button>
        </div>
      </div>

      <div className="logout-button-container">
        <button onClick={handleLogout} className="btn btn-danger btn-lg">
          <span aria-hidden="true" style={{marginRight: '8px'}}>🚪</span> Log Out
        </button>
      </div>
    </CommonEmbeddedPageStructure>
  );
};

// --- Daily Tracker Redesign ---
let mockTrackersData = [
  { 
    id: 'h1', name: 'Code one problem', emoji: '💻', goalDescription: 'Solve a LeetCode or HackerRank problem', 
    currentStreak: 5, longestStreak: 15, frequency: 'Daily', color: 'var(--color-accent1)',
    streakFreezes: { remaining: 1, total: 1 },
    buddyProgress: 75,
    logs: [
      { date: '2024-07-22', status: 'completed', proof: { type: 'link', value: 'https://leetcode.com/problems/two-sum/', comment: 'Classic one to warm up.' } },
      { date: '2024-07-21', status: 'completed', proof: { type: 'screenshot', value: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDE1MCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjE1MCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNDQ0ZCRjEiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxMiIgZm9udC1mYW1pbHk9ImFyaWFsIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZmlsbD0iIzBGNzY2RSI+U2NyZWVuc2hvdAo8L3RleHQ+PC9zdmc+', comment: 'Finished the daily challenge.' } },
      { date: '2024-07-20', status: 'completed', proof: { type: 'unverified', value: null, comment: 'Just a quick one today.' } },
      { date: '2024-07-18', status: 'frozen', proof: { type: 'frozen', value: null, comment: 'Used a freeze.' } },
    ]
  },
  { 
    id: 'h2', name: 'Learn 5 vocab words', emoji: '🇯🇵', goalDescription: 'Using Anki deck for Japanese', 
    currentStreak: 0, longestStreak: 12, frequency: 'Daily', color: 'var(--color-accent2)',
    streakFreezes: { remaining: 0, total: 1 },
    buddyProgress: 90,
    logs: [] 
  },
];

const BuddyAlertBar = () => {
    const randomValue = Math.random();
    const buddyStatus: 'completed' | 'missed' | 'none' = randomValue > 0.66 ? 'completed' : randomValue > 0.33 ? 'missed' : 'none';
    const buddyName = 'Alex';

    if (buddyStatus === 'completed') {
        return (
            <div className="buddy-alert-bar success">
                <span role="img" aria-hidden="true">🎉</span> You and {buddyName} both completed your trackers today. Great job!
            </div>
        );
    } else if (buddyStatus === 'missed') {
        return (
            <div className="buddy-alert-bar warning">
                <span role="img" aria-hidden="true">👀</span> Your buddy {buddyName} missed yesterday. <button className="btn-link">Nudge them?</button>
            </div>
        );
    }
    return null; // Don't show if there's nothing to report
};


const StreakVisual = ({ streak }) => {
  let streakText;
  if (streak === 0) {
    streakText = "Start your streak!";
  } else if (streak < 5) {
    streakText = "Getting started!";
  } else {
    streakText = "On fire!";
  }

  return (
    <div className="streak-visual-container">
      <div className="streak-visual" aria-label={`Current streak: ${streak} days`}>
        <span className="streak-icon" style={{color: streak > 0 ? 'orange' : 'gray'}}>🔥</span>
        <span className="streak-count">{streak}</span>
      </div>
      <p className="streak-text">{streak} Day{streak !== 1 ? 's' : ''} Strong - {streakText}</p>
    </div>
  );
};

const SharedXpBarDaily = ({ buddyProgress = 75 }) => (
    <div className="shared-xp-daily">
        <div className="shared-xp-daily-labels">
            <span>You</span>
            <span>Buddy</span>
        </div>
        <div className="shared-xp-daily-bar">
            <div className="shared-xp-daily-user" style={{width: '100%'}}></div>
            <div className="shared-xp-daily-buddy" style={{width: `${buddyProgress}%`}}></div>
        </div>
    </div>
);

const DailyTrackerPage = ({ navigateTo, isEmbedded, onTrackerUpdate: notifyParentOfTrackerUpdate }) => {
  const [trackers, setTrackers] = useState(() => JSON.parse(JSON.stringify(mockTrackersData))); // Deep copy
  const [inputs, setInputs] = useState({});
  const [commentBoxVisibility, setCommentBoxVisibility] = useState({});

  const updateTrackersState = (newTrackers) => {
    setTrackers(newTrackers);
    mockTrackersData = JSON.parse(JSON.stringify(newTrackers)); // Update global mock data
    if (notifyParentOfTrackerUpdate) {
      notifyParentOfTrackerUpdate(newTrackers);
    }
  };

  const handleInputChange = (trackerId, field, value) => {
      setInputs(prev => ({
          ...prev,
          [trackerId]: {
              ...prev[trackerId],
              [field]: value,
          }
      }));
  };

  const handleFileChange = (e, trackerId) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
            handleInputChange(trackerId, 'screenshotPreview', reader.result as string);
        };
        reader.readAsDataURL(file);
    } else {
        alert('Please upload a valid image file.');
    }
  };

  const handleCheckIn = (trackerId, type, xp = 0) => {
      const trackerInputs = inputs[trackerId] || {};
      let proofValue = null;
      if (type === 'screenshot') proofValue = trackerInputs.screenshotPreview;
      if (type === 'link') proofValue = trackerInputs.link;

      if ((type === 'screenshot' && !proofValue) || (type === 'link' && !proofValue)) {
          alert(`Please provide a ${type} to check in.`);
          return;
      }
      
      awardXp(xp);

      const today = getTodaysDateString();
      const todayLogIndex = mockCheckinsLog.findIndex(log => log.date === today);
      if(todayLogIndex > -1) {
        mockCheckinsLog[todayLogIndex].count += 1;
      } else {
        mockCheckinsLog.push({ date: today, count: 1 });
      }

      const newLog = {
          date: today,
          status: 'completed',
          proof: {
              type: type,
              value: proofValue,
              comment: trackerInputs.comment || null,
          }
      };

      const updatedTrackers = trackers.map(t => {
          if (t.id === trackerId) {
              const newLogs = [newLog, ...t.logs];
              const newStreak = (t.currentStreak || 0) + 1; 
              return { 
                  ...t, 
                  logs: newLogs, 
                  currentStreak: newStreak,
                  longestStreak: Math.max(t.longestStreak || 0, newStreak)
              };
          }
          return t;
      });

      updateTrackersState(updatedTrackers);
      setInputs(prev => ({...prev, [trackerId]: {}})); // Clear inputs for this tracker
  };
  
   const handleUseStreakFreeze = (trackerId) => {
        const updatedTrackers = trackers.map(t => {
            if (t.id === trackerId && t.streakFreezes.remaining > 0) {
                const newLog = {
                    date: getTodaysDateString(),
                    status: 'frozen',
                    proof: { type: 'frozen', value: null, comment: null }
                };
                const newLogs = [newLog, ...t.logs];
                return { 
                    ...t, 
                    logs: newLogs, 
                    streakFreezes: { ...t.streakFreezes, remaining: t.streakFreezes.remaining - 1 }
                };
            }
            return t;
        });
        updateTrackersState(updatedTrackers);
   }

  const headerActions = (
      <button onClick={() => alert('Add new daily habit form coming soon! P.S. We can help you link this new habit to one of your Milestone Goals.')} className="btn btn-primary">
          Create New Habit
      </button>
  );
  
  const getProofIcon = (proofType) => {
    switch(proofType) {
        case 'screenshot': return '🖼️';
        case 'link': return '🔗';
        case 'unverified': return '✔️';
        case 'frozen': return '🧊';
        default: return '❔';
    }
  }

  return (
    <CommonEmbeddedPageStructure
      title="🌿 Daily Habits"
      subtitle="Small actions repeated daily lead to big results. Build your streak!"
      isEmbedded={isEmbedded}
      navigateTo={navigateTo}
      customClassName="embedded-page-content habit-tracker-page-content"
      headerActions={headerActions}
      headerContent={<BuddyAlertBar />}
    >
      {trackers.length === 0 ? (
        <div className="habit-empty-state">
          <div className="mascot-placeholder empty-state-mascot">Mascot Here!</div>
          <span className="habit-empty-icon" aria-hidden="true">🌱</span>
          <h2>Your Habit Tracker is Empty!</h2>
          <p>Click 'Create New Habit' to add a daily task and start building your streak.</p>
        </div>
      ) : (
        <div className="habits-list">
          {trackers.map(tracker => {
            const todaysLog = tracker.logs.find(log => log.date === getTodaysDateString());
            const trackerInputs = inputs[tracker.id] || {};
            const isCommentBoxVisible = commentBoxVisibility[tracker.id];
            const linkedGoal = mockGoalsData.find(g => g.linkedHabitId === tracker.id);
            
            return (
              <div key={tracker.id} className="habit-item-card" style={{ '--habit-color': tracker.color } as React.CSSProperties}>
                <div className="habit-header">
                  <span className="habit-icon-bg" aria-hidden="true">{tracker.emoji}</span>
                  <div className="habit-info">
                    <h3 className="habit-name">{tracker.name}</h3>
                  </div>
                   {linkedGoal && <div className="linked-goal-badge" title={`Supports Goal: ${linkedGoal.title}`}>🎯</div>}
                </div>
                
                <div className="habit-visuals">
                    <StreakVisual streak={tracker.currentStreak || 0} />
                    <SharedXpBarDaily buddyProgress={tracker.buddyProgress} />
                </div>
                
                <div className="habit-completion-section">
                  {todaysLog ? (
                    <div className="completion-display">
                        <p><strong>Today's Proof:</strong></p>
                        <div className="proof-item">
                            <span className="proof-icon">{getProofIcon(todaysLog.proof.type)}</span>
                            <span className="proof-type-text">{todaysLog.proof.type}</span>
                            {todaysLog.proof.type === 'screenshot' && <img src={todaysLog.proof.value} alt="Screenshot proof" className="proof-thumbnail" />}
                            {todaysLog.proof.type === 'link' && <a href={todaysLog.proof.value} target="_blank" rel="noopener noreferrer" className="proof-link">{todaysLog.proof.value}</a>}
                        </div>
                        {todaysLog.proof.comment && <p className="proof-comment"><em>"{todaysLog.proof.comment}"</em></p>}
                        <button className="btn btn-sm btn-secondary btn-block">🛠️ Edit Proof</button>
                    </div>
                  ) : (
                    <div className="completion-actions">
                        <div className="completion-method">
                            <label htmlFor={`screenshot-${tracker.id}`} className="btn btn-sm btn-secondary">
                                🖼️ Upload Screenshot
                            </label>
                            <input type="file" id={`screenshot-${tracker.id}`} accept="image/*" onChange={(e) => handleFileChange(e, tracker.id)} style={{display: 'none'}} />
                            {trackerInputs.screenshotPreview && (
                                <div className="proof-preview">
                                    <img src={trackerInputs.screenshotPreview} alt="Preview" className="proof-thumbnail" />
                                    <button onClick={() => handleCheckIn(tracker.id, 'screenshot', 10)} className="btn btn-sm btn-success">Confirm (+10 XP)</button>
                                </div>
                            )}
                        </div>
                        <div className="completion-method">
                           <input type="text" placeholder="Paste Link (e.g., GitHub, LeetCode)" value={trackerInputs.link || ''} onChange={(e) => handleInputChange(tracker.id, 'link', e.target.value)} className="form-control form-control-sm" />
                           {trackerInputs.link && <button onClick={() => handleCheckIn(tracker.id, 'link', 10)} className="btn btn-sm btn-success">Confirm (+10 XP)</button>}
                        </div>
                         <div className="completion-method">
                            <button onClick={() => handleCheckIn(tracker.id, 'unverified', 0)} className="btn btn-sm btn-outline-light btn-block">✔️ Mark as Done (No XP)</button>
                        </div>
                    </div>
                  )}
                </div>

                {!todaysLog && (
                    <div className="optional-comment-section">
                        <button className="btn-link" onClick={() => setCommentBoxVisibility(p => ({...p, [tracker.id]: !p[tracker.id]}))}>
                             {isCommentBoxVisible ? 'Hide comment' : 'Want to jot something down?'}
                        </button>
                        {isCommentBoxVisible && (
                             <textarea 
                                value={trackerInputs.comment || ''}
                                onChange={(e) => handleInputChange(tracker.id, 'comment', e.target.value)}
                                className="form-control form-control-sm" 
                                placeholder="Optional comment..."
                                rows={2}
                            />
                        )}
                    </div>
                )}
                
                <div className="habit-footer">
                   <div className="streak-freeze-section">
                        <span>🧊 Streak Freeze: <strong>{tracker.streakFreezes.remaining}</strong> left</span>
                        <button className="btn btn-sm btn-info" onClick={() => handleUseStreakFreeze(tracker.id)} disabled={todaysLog || tracker.streakFreezes.remaining === 0}>Use Token</button>
                    </div>
                    <div className="recent-checkins">
                        {tracker.logs.slice(0, 7).map(log => (
                            <div key={log.date} className="checkin-day-icon" title={`${log.date}: ${log.proof.type}`}>
                                {getProofIcon(log.proof.type)}
                            </div>
                        ))}
                    </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </CommonEmbeddedPageStructure>
  );
};


const App = () => {
  const [currentPage, setCurrentPage] = useState('welcome');
  const [pageProps, setPageProps] = useState <any>({}); 

  (window as any).__APP_STATE__ = { pageProps };


  const navigateTo = (page: string, props = {}) => {
    setCurrentPage(page);
    setPageProps(props);
    (window as any).__APP_STATE__.pageProps = props; 
    window.scrollTo(0,0);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'welcome':
        return <WelcomeScreen navigateTo={navigateTo} />;
      case 'auth':
        return <AuthPage navigateTo={navigateTo} initialView={pageProps.view} key={pageProps.view || 'auth'} />;
      case 'tagSelection':
        return <TagSelectionPage navigateTo={navigateTo} />;
      case 'meetBuddy':
        return <MeetYourBuddyPage navigateTo={navigateTo} />;
      case 'mainHome':
        return <MainHomePage navigateTo={navigateTo} activeView={pageProps.activeView || 'dashboard'} key={pageProps.activeView + JSON.stringify(pageProps.goalId)} />; 
      
      default:
        return <WelcomeScreen navigateTo={navigateTo} />;
    }
  };

  let appShellClass = 'app-shell';
  if (currentPage === 'auth') {
    appShellClass += ' auth-active-fullscreen';
  } else if (currentPage === 'welcome') {
    appShellClass += ' welcome-active-fullscreen';
  } else if (currentPage === 'mainHome') {
    appShellClass += ' main-app-active';
  }
  
  if (mockUserProfile.darkMode) {
      appShellClass += ' dark-mode-active';
  }

  return (
    <div className={appShellClass}>
      {renderPage()}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element. Ensure an element with id="root" exists in your HTML.');
}