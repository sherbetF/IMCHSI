import { useEffect, useState, useRef } from "react";
import {
  Phone,
  Building2,
  LogOut,
  ShieldCheck,
  MapPin,
  Clock,
  Mail,
  X,
  PhoneCall,
  Bell,
  CheckCheck,
  ExternalLink,
  Menu,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import jataNegaraLogo from "@/assets/jata-negara.svg";
import { useFacility } from "@/context/FacilityContext";
import {
  subscribeToAllPendingNotifications,
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  UnifiedRequestNotification,
} from "@/services/firebaseAppointments";

const nav = [
  { label: "Home", to: "/" as const },
  { label: "Appointment", to: "/" as const, isAppointmentScroll: true },
  { label: "Echocardiogram", to: "/echo" as const },
  { label: "Stress Test", to: "/stress-test" as const },
  { label: "Holter", to: "/holter" as const },
];

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function SiteHeader() {
  const { selectedFacility, setSelectedFacility, isAdmin, openModal, isMounted } = useFacility();
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<UnifiedRequestNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setReadIds(getReadNotificationIds());
  }, []);

  useEffect(() => {
    // On a direct/deep route, FacilityContext restores localStorage after the
    // first render. Do not subscribe with a null facility during that window,
    // otherwise the header opens three unfiltered Firestore listeners.
    if (!isMounted || !selectedFacility) {
      setNotifications([]);
      return;
    }

    const unsub = subscribeToAllPendingNotifications(
      selectedFacility.name,
      isAdmin,
      (notifs) => {
        setNotifications(notifs);
        setReadIds(getReadNotificationIds());
      },
    );

    const handleUpdate = () => {
      setReadIds(getReadNotificationIds());
    };
    window.addEventListener("hsi_requests_updated", handleUpdate);
    return () => {
      unsub();
      window.removeEventListener("hsi_requests_updated", handleUpdate);
    };
  }, [isMounted, selectedFacility, isAdmin]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    if (isNotifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNotifOpen]);

  const unreadNotifications = notifications.filter((n) => !readIds.includes(n.id));
  const unreadCount = unreadNotifications.length;

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead(notifications.map((n) => n.id));
    setReadIds(notifications.map((n) => n.id));
  };

  const handleAppointmentClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname === "/") {
      const el = document.getElementById("appointment-portals");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      navigate({ to: "/" }).then(() => {
        setTimeout(() => {
          const el = document.getElementById("appointment-portals");
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
          }
        }, 120);
      });
    }
  };

  const now = useClock();
  const local = now
    ? `${pad(now.getHours())} : ${pad(now.getMinutes())} : ${pad(now.getSeconds())}`
    : "-- : -- : --";
  const date = now
    ? now.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <header>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-5 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow text-muted-foreground">{date}</p>
            <span className="hidden text-border sm:inline">|</span>
            {isMounted && selectedFacility ? (
              <button
                type="button"
                onClick={() => openModal("facility")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold hover:opacity-80 transition-opacity ${
                  isAdmin
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-primary/30 bg-primary/10 text-primary"
                }`}
                title="Click to change facility"
              >
                {isAdmin ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : (
                  <Building2 className="h-3.5 w-3.5" />
                )}
                <span>
                  {selectedFacility.name} {isAdmin ? "" : `(${selectedFacility.category})`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openModal("greeting")}
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Select Facility</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="eyebrow text-muted-foreground">Hospital Time</span>
            <span className="font-mono text-xs font-semibold text-success">{local}</span>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={jataNegaraLogo}
              alt="Coat of Arms of Malaysia"
              className="h-8 w-auto object-contain shrink-0"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.triedFallback) {
                  target.dataset.triedFallback = "true";
                  target.src = "/jata-negara.png";
                }
              }}
            />
            <span className="text-[11px] font-bold leading-tight tracking-wide text-heading">
              INTERNAL MEDICINE
              <br />
              HOSPITAL SULTAN ISMAIL
            </span>
          </Link>

          <nav className="hidden items-center gap-5 xl:gap-6 lg:flex">
            {nav.map((item) => {
              if (item.isAppointmentScroll) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={handleAppointmentClick}
                    className="text-sm font-medium text-foreground transition-colors hover:text-primary cursor-pointer"
                  >
                    {item.label}
                  </button>
                );
              }

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  activeProps={{ className: "text-primary font-semibold" }}
                  inactiveProps={{ className: "text-foreground" }}
                  className="text-sm transition-colors hover:text-primary"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {/* Notification Bell Dropdown Button - accessible for facility & admin */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors shadow-sm ${
                  isAdmin
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                    : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                }`}
                title="Appointment Requests & Notifications"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-extrabold text-white shadow-sm animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl border border-border bg-surface p-4 shadow-2xl animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <Bell className={`h-4 w-4 ${isAdmin ? "text-amber-500" : "text-primary"}`} />
                      <h4 className="text-sm font-bold text-heading">
                        {isAdmin
                          ? "New Appointment Requests"
                          : selectedFacility
                            ? `${selectedFacility.name} Notifications`
                            : "Appointment Notifications"}
                      </h4>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isAdmin
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "bg-primary/20 text-primary"
                        }`}
                      >
                        {unreadCount} unread
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Mark read
                      </button>
                    )}
                  </div>

                  <div className="mt-3 max-h-80 overflow-y-auto space-y-2.5 pr-1">
                    {notifications.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        No pending appointment requests or updates.
                      </p>
                    ) : (
                      notifications.map((n) => {
                        const isRead = readIds.includes(n.id);
                        return (
                          <div
                            key={n.id}
                            className={`rounded-xl border p-3 text-xs transition-all ${
                              isRead
                                ? "border-border/50 bg-background/50 text-muted-foreground"
                                : isAdmin
                                  ? "border-amber-500/40 bg-amber-500/10 text-foreground"
                                  : "border-primary/40 bg-primary/5 text-foreground"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-primary">
                                {n.id}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                    n.urgency === "Urgent"
                                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                      : "bg-surface text-muted-foreground border border-border/40"
                                  }`}
                                >
                                  {n.urgency}
                                </span>
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                  {n.status}
                                </span>
                              </div>
                            </div>

                            <div className="mt-1">
                              <p className="font-bold text-heading text-xs">{n.patientName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                MRN: {n.mrn} • {n.testType}
                              </p>
                            </div>

                            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                              <span>Facility: {n.facilityName}</span>
                              <Link
                                to={n.route}
                                onClick={() => {
                                  markNotificationAsRead(n.id);
                                  setIsNotifOpen(false);
                                }}
                                className="flex items-center gap-1 font-bold text-primary hover:underline"
                              >
                                Review <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsContactModalOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary hover:text-primary hover:bg-surface shadow-sm"
              title="Contact Us"
              aria-label="Contact Us"
            >
              <Phone className="h-4 w-4" />
            </button>

            {isMounted && selectedFacility && (
              <button
                type="button"
                onClick={() => setSelectedFacility(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 shadow-sm"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary hover:text-primary hover:bg-surface lg:hidden shadow-sm"
              title="Toggle Menu"
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div className="border-t border-border bg-surface px-5 py-3 lg:hidden space-y-1 animate-in fade-in">
            {nav.map((item) => {
              if (item.isAppointmentScroll) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={(e) => {
                      setIsMobileMenuOpen(false);
                      handleAppointmentClick(e);
                    }}
                    className="block w-full text-left py-2 px-3 text-sm font-medium rounded-lg text-foreground hover:bg-accent hover:text-primary transition-colors"
                  >
                    {item.label}
                  </button>
                );
              }

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  activeOptions={{ exact: true }}
                  activeProps={{ className: "bg-primary/10 text-primary font-semibold" }}
                  inactiveProps={{ className: "text-foreground" }}
                  className="block w-full text-left py-2 px-3 text-sm font-medium rounded-lg hover:bg-accent hover:text-primary transition-colors"
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Contact Details Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <button
              onClick={() => setIsContactModalOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3.5 border-b border-border pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <PhoneCall className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-heading">Contact Details</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  Internal Medicine • Hospital Sultan Ismail
                </p>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/50 p-3.5">
                <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-heading">Location & Unit</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Internal Medicine Clinic : Room 21
                    <br />
                    Echo Room : Room 15
                    <br />
                    Holter/Stress Test : Room 10
                    <br />
                    Level 2 , Hospital Sultan Ismail , Johor Bahru
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/50 p-3.5">
                <Phone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-heading">Telephone & Extensions</p>
                  <p className="text-xs text-muted-foreground">
                    Hospital General Line:{" "}
                    <span className="font-semibold text-foreground">07-356 5000</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Internal Medicine Clinic:{" "}
                    <span className="font-semibold text-primary">Ext. 2214</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Echo Room: <span className="font-semibold text-primary">Ext. 2225</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Holter/Stress Test Room:{" "}
                    <span className="font-semibold text-primary">Ext. 2215</span>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/50 p-3.5">
                <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-heading">Operating Hours</p>
                  <p className="text-xs text-muted-foreground">
                    Monday – Friday:{" "}
                    <span className="font-semibold text-foreground">8:00 AM – 5:00 PM</span>
                  </p>
                  <p className="text-xs text-muted-foreground text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                    Saturday , Sunday & Public Holidays: Closed
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/50 p-3.5">
                <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-heading">Official Email</p>
                  <a
                    href="mailto:clinicpakarperubatanhsi@gmail.com"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    clinicpakarperubatanhsi@gmail.com
                  </a>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
