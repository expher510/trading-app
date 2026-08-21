import { useEffect, useState } from "react";
import { TradingPage } from "./pages/TradingPage.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { useAuthStore as useAppAuth } from "./services/auth.ts";
import { useAuthStore, useTradingStore } from "./services/store.tsx";
import { AuthModal } from "./components/AuthModal.tsx";

/**
 * Trading MiniApp entry point with Unified Web & Telegram Auth and Admin Routing.
 */
export function App() {
  const [ready, setReady] = useState(false);
  const [isAdminRoute, setIsAdminRoute] = useState(() => {
    return (
      window.location.pathname.startsWith("/admin") ||
      window.location.hash.startsWith("#admin")
    );
  });

  const demoLogin = useAuthStore((s) => s.demoLogin);
  const loadSymbols = useTradingStore((s) => s.loadSymbols);
  const loadAccounts = useTradingStore((s) => s.loadAccounts);
  const initAppAuth = useAppAuth((s) => s.initAuth);

  useEffect(() => {
    const handlePopState = () => {
      setIsAdminRoute(
        window.location.pathname.startsWith("/admin") ||
        window.location.hash.startsWith("#admin")
      );
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await demoLogin();
      await initAppAuth();
      localStorage.setItem("is_demo", "false");
      useAuthStore.setState({ isDemo: false });
      await Promise.all([loadSymbols(), loadAccounts()]);
      if (!cancelled) setReady(true);
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [demoLogin, loadSymbols, loadAccounts, initAppAuth]);

  if (isAdminRoute) {
    return <AdminPage />;
  }

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a] text-neutral-400">
        Loading Trading MiniApp…
      </div>
    );
  }

  return (
    <>
      <TradingPage />
      <AuthModal />
    </>
  );
}
