import { create } from "zustand";
import { setAccountBalance } from "./demo/engine";
import { useTradingStore } from "./store";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
          };
        };
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

export interface UserProfile {
  id: string;
  email?: string;
  telegram_id?: number;
  first_name?: string;
  username?: string;
  balance: number;
  created_at?: string;
}

interface AuthState {
  user: UserProfile | null;
  isTelegram: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  isProfileModalOpen: boolean;
  setUser: (user: UserProfile | null) => void;
  setIsAuthModalOpen: (open: boolean) => void;
  setIsProfileModalOpen: (open: boolean) => void;
  initAuth: () => Promise<void>;
  logout: () => void;
  updateUserBalance: (newBalance: number) => void;
}

function extractTelegramUser(): { id: number; first_name?: string; username?: string } | null {
  // 1. Direct WebApp initDataUnsafe
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  if (tg?.initDataUnsafe?.user?.id) {
    return tg.initDataUnsafe.user;
  }

  // 2. Parse initData string
  if (tg?.initData) {
    try {
      const params = new URLSearchParams(tg.initData);
      const userStr = params.get("user");
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed?.id) return parsed;
      }
    } catch {}
  }

  // 3. Fallback: Check location hash / search for tgWebAppData
  if (typeof window !== "undefined") {
    try {
      const hashStr = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const searchStr = window.location.search.startsWith("?") ? window.location.search.slice(1) : "";
      const fullQuery = hashStr.includes("=") ? hashStr : searchStr;

      const rawParams = new URLSearchParams(fullQuery);
      const tgWebAppData = rawParams.get("tgWebAppData");
      if (tgWebAppData) {
        const nestedParams = new URLSearchParams(tgWebAppData);
        const userStr = nestedParams.get("user");
        if (userStr) {
          const parsed = JSON.parse(userStr);
          if (parsed?.id) return parsed;
        }
      }
    } catch {}
  }

  return null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isTelegram: false,
  isLoading: true,
  isAuthModalOpen: false,
  isProfileModalOpen: false,
  setIsAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  setIsProfileModalOpen: (open) => set({ isProfileModalOpen: open }),
  setUser: (user) => {
    set({ user });
    if (user) {
      localStorage.setItem("trading_user", JSON.stringify(user));
      setAccountBalance(user.balance);
      syncTradingStoreBalance(user.balance);
    } else {
      localStorage.removeItem("trading_user");
    }
  },
  updateUserBalance: (newBalance) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, balance: newBalance };
      get().setUser(updated);
    }
  },
  logout: () => {
    localStorage.removeItem("trading_user");
    set({ user: null, isAuthModalOpen: true });
    setAccountBalance(0);
    syncTradingStoreBalance(0);
  },
  initAuth: async () => {
    try {
      // 1. Check if running inside Telegram Mini App
      const tg = window.Telegram?.WebApp;
      if (tg?.ready) tg.ready();
      if (tg?.expand) tg.expand();

      const tgUser = extractTelegramUser();
      if (tgUser?.id) {
        set({ isTelegram: true });
        // Auto authenticate with backend
        const res = await fetch("/api/user/telegram-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegram_id: tgUser.id,
            first_name: tgUser.first_name,
            username: tgUser.username,
          }),
        });
        const data = await res.json();
        if (data.status === "success" && data.user) {
          get().setUser(data.user);
          set({ isLoading: false });
          return;
        }
      }

      // 2. Check cached web user session
      const cached = localStorage.getItem("trading_user");
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as UserProfile;
          get().setUser(parsed);
          // Sync fresh balance from server
          if (parsed.id) {
            fetch(`/api/user/${parsed.id}`)
              .then((r) => r.json())
              .then((d) => {
                if (d.status === "success" && d.user) {
                  get().setUser(d.user);
                }
              })
              .catch(() => {});
          }
          set({ isLoading: false });
          return;
        } catch {}
      }

      // 3. Unauthenticated Web User
      set({ isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));

function syncTradingStoreBalance(balance: number) {
  const { accounts } = useTradingStore.getState();
  if (accounts && accounts.length > 0) {
    const acc = accounts[0];
    acc.balance = balance;
    acc.equity = balance;
    acc.freeMargin = balance;
    useTradingStore.setState({ accounts: [...accounts] });
  }
}
