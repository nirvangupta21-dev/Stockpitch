import { useState, type FormEvent } from "react";
import { LogIn, LogOut, ShieldCheck, User, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Mode = "login" | "signup";

export default function AccountMenu() {
  const { user, login, logout, signup } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const initials = user?.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "ME";

  function openAuth(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") await signup({ name, email, password });
      else await login({ email, password });
      setOpen(false);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Account action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 px-2" data-testid="button-account-menu">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {initials}
              </span>
              <span className="hidden xl:inline max-w-28 truncate text-xs font-semibold">{user.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Personal account</span>
              </div>
              <p className="mt-1 truncate text-xs font-normal text-muted-foreground">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="secondary" size="sm" className="gap-2 shrink-0" onClick={() => openAuth("login")} data-testid="button-sign-in">
          <User className="h-4 w-4" />
          <span className="hidden md:inline">Sign in</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "signup" ? "Create your account" : "Sign in"}</DialogTitle>
            <DialogDescription>
              Save portfolio positions and watchlists under your own profile.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Name</span>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  autoComplete="name"
                  required
                />
              </label>
            )}
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Email</span>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Password</span>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={mode === "signup" ? 8 : 1}
                required
              />
            </label>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

            <Button type="submit" className="w-full gap-2" disabled={busy}>
              {mode === "signup" ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {busy ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
            </Button>

            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}
            >
              {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
