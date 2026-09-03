import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useTheme } from "./lib/useTheme";
import { useStealth } from "./lib/useStealth";
import {
  IconBolt,
  IconCards,
  IconChart,
  IconChevron,
  IconClock,
  IconCode,
  IconDashboard,
  IconFile,
  IconFolder,
  IconGuide,
  IconMic,
  IconMonitor,
  IconMoon,
  IconNotes,
  IconPractice,
  IconRocket,
  IconScan,
  IconShield,
  IconSliders,
  IconStar,
  IconSun,
  IconWand,
} from "./components/icons";
import Dashboard from "./pages/Dashboard";
import PrepRoom from "./pages/PrepRoom";
import Practice from "./pages/Practice";
import QuestionAnalyzer from "./pages/QuestionAnalyzer";
import CodingLab from "./pages/CodingLab";
import MockInterview from "./pages/MockInterview";
import SetupGuide from "./pages/SetupGuide";
import ResumeContext from "./pages/ResumeContext";
import ResumeTailoring from "./pages/ResumeTailoring";
import Resources from "./pages/Resources";
import MeetingNotes from "./pages/MeetingNotes";
import History from "./pages/History";
import Favorites from "./pages/Favorites";
import Review from "./pages/Review";
import Insights from "./pages/Insights";
import Settings from "./pages/Settings";

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: typeof IconDashboard; end?: boolean }[] }[] = [
  {
    label: "Prepare",
    items: [
      { to: "/", label: "Dashboard", icon: IconDashboard, end: true },
      { to: "/prep-room", label: "Prep Room", icon: IconRocket },
      { to: "/practice", label: "Practice", icon: IconPractice },
      { to: "/coding-lab", label: "Coding Lab", icon: IconCode },
      { to: "/mock-interview", label: "Mock Interview", icon: IconMic },
      { to: "/analyzer", label: "Question Analyzer", icon: IconScan },
      { to: "/setup-guide", label: "Setup Guide", icon: IconGuide },
    ],
  },
  {
    label: "Your profile",
    items: [
      { to: "/resume", label: "Resume Context", icon: IconFile },
      { to: "/resume-tailoring", label: "Resume Tailoring", icon: IconWand },
      { to: "/resources", label: "Resources", icon: IconFolder },
      { to: "/meeting-notes", label: "Meeting Notes", icon: IconNotes },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/history", label: "History", icon: IconClock },
      { to: "/favorites", label: "Favorites", icon: IconStar },
      { to: "/review", label: "Review", icon: IconCards },
      { to: "/insights", label: "Insights", icon: IconChart },
    ],
  },
];

const THEMES = [
  { id: "light", icon: IconSun, label: "Light" },
  { id: "system", icon: IconMonitor, label: "System" },
  { id: "dark", icon: IconMoon, label: "Dark" },
] as const;

export default function App() {
  const { theme, setTheme } = useTheme();
  const { stealth, toggleStealth } = useStealth();
  const navigate = useNavigate();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => window.api.menu.onNavigate(navigate), [navigate]);
  useEffect(() => {
    document.documentElement.classList.toggle("stealth-cursor", stealth);
  }, [stealth]);
  useEffect(() => {
    window.api.windowControls.isMaximized().then(setMaximized);
    return window.api.windowControls.onMaximizedChange(setMaximized);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      {/* custom titlebar — the window is frameless (see main.ts) so this replaces the
          native title bar; traffic lights match the mac-style Liquid Glass look on every OS */}
      <div className="flex h-10 shrink-0 items-center gap-3 px-4 [-webkit-app-region:drag]">
        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <button
            onClick={() => window.api.windowControls.close()}
            title="Close"
            className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#ff5f57] transition-transform active:scale-90"
          >
            <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 transition-opacity group-hover:opacity-100">
              <path d="M0.5 0.5L5.5 5.5M5.5 0.5L0.5 5.5" stroke="#4d0000" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => window.api.windowControls.minimize()}
            title="Minimize"
            className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#febc2e] transition-transform active:scale-90"
          >
            <svg width="6" height="2" viewBox="0 0 6 2" className="opacity-0 transition-opacity group-hover:opacity-100">
              <path d="M0.5 1H5.5" stroke="#7a4a00" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => window.api.windowControls.toggleMaximize()}
            title={maximized ? "Restore" : "Maximize"}
            className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#28c840] transition-transform active:scale-90"
          >
            <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 transition-opacity group-hover:opacity-100">
              <path
                d="M1 5L5 1M1.5 1H5V4.5"
                stroke="#005f13"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
        <div className="pointer-events-none flex-1 select-none text-center text-[12px] font-medium text-faint">
          MeetingPrep AI
        </div>
        <button
          onClick={() => window.api.windowControls.showMenu()}
          title="Menu"
          className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors [-webkit-app-region:no-drag] hover:bg-fg/[0.06] hover:text-fg"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 gap-3 overflow-hidden px-3 pb-3">
      <aside className="relative flex w-64 shrink-0 flex-col overflow-hidden rounded-[28px] border border-hairline bg-surface/70 shadow-pop backdrop-blur-2xl">
        {/* brand */}
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-accent to-accent-strong text-white shadow-glow">
            <IconBolt size={17} strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight text-fg">
              MeetingPrep <span className="text-accent">AI</span>
            </div>
            <div className="text-[10.5px] font-medium tracking-wide text-faint">interview prep studio</div>
          </div>
        </div>

        {/* nav */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors duration-200 ${
                        isActive
                          ? "bg-accent/12 text-fg"
                          : "text-muted hover:bg-fg/[0.05] hover:text-fg"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          size={15.5}
                          className={`shrink-0 transition-colors ${
                            isActive ? "text-accent" : "text-faint group-hover:text-muted"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                        {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* footer: capture shield + theme */}
        <div className="space-y-2.5 border-t border-hairline p-3">
          <button
            onClick={toggleStealth}
            title="Hide this window from screen sharing and captures (Ctrl+Shift+H)"
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors duration-200 ${
              stealth ? "bg-accent/15 text-accent" : "text-muted hover:bg-fg/[0.05] hover:text-fg"
            }`}
          >
            <IconShield size={15.5} className="shrink-0" />
            <span className="truncate">Capture shield</span>
            <span
              className={`ml-auto h-1.5 w-1.5 rounded-full transition-colors ${
                stealth ? "animate-pulse-soft bg-accent" : "bg-faint/50"
              }`}
            />
          </button>

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-fg/[0.05] p-1">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                title={t.label}
                className={`flex items-center justify-center rounded-md py-1.5 transition-colors duration-200 ${
                  theme === t.id ? "bg-surface text-fg shadow-sm" : "text-faint hover:text-muted"
                }`}
              >
                <t.icon size={14} />
              </button>
            ))}
          </div>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors duration-200 ${
                isActive ? "bg-accent/12 text-fg" : "text-muted hover:bg-fg/[0.05] hover:text-fg"
              }`
            }
          >
            <IconSliders size={15.5} className="shrink-0 text-faint" />
            Settings
            <IconChevron size={12} className="ml-auto text-faint" />
          </NavLink>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto rounded-[28px]">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/prep-room" element={<PrepRoom />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/coding-lab" element={<CodingLab />} />
          <Route path="/mock-interview" element={<MockInterview />} />
          <Route path="/analyzer" element={<QuestionAnalyzer />} />
          <Route path="/setup-guide" element={<SetupGuide />} />
          <Route path="/resume" element={<ResumeContext />} />
          <Route path="/resume-tailoring" element={<ResumeTailoring />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/meeting-notes" element={<MeetingNotes />} />
          <Route path="/history" element={<History />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/review" element={<Review />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      </div>
    </div>
  );
}
