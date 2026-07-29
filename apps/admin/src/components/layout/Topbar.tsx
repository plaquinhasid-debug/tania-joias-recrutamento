import { LogOut, Menu, User as UserIcon } from "lucide-react"

import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface TopbarProps {
  onToggleSidebar: () => void
  title: string
}

export function Topbar({ onToggleSidebar, title }: TopbarProps) {
  const { user, signOut } = useAuth()
  const email = user?.email ?? ""
  const initials = email ? email.slice(0, 2).toUpperCase() : "TJ"

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Alternar menu">
          <Menu className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-1 pr-3 transition-colors hover:bg-secondary">
            <Avatar className="size-8">
              <AvatarFallback className="bg-gold/20 text-xs text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm text-foreground sm:inline">
              {email || "Equipe"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="flex items-center gap-2 text-foreground">
            <UserIcon className="size-3.5" /> {email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()} className="text-destructive">
            <LogOut className="size-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
