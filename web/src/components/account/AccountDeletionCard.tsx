"use client";

import { useEffect, useState, useTransition } from "react";

import {
  cancelAccountDeletion,
  getAccountDeletionStatus,
  requestAccountDeletion,
  type DeletionRequestView,
} from "@/lib/account/deletion-actions";
import type { BlockerCode, DeletionBlocker, DeletionSurface } from "@/lib/account/deletion";

/**
 * "Delete my account" panel shared by talent settings, client settings and
 * the workspace Danger zone. Self-contained EN/ES copy (the three surfaces use
 * three different i18n systems; one table here keeps the legal wording
 * identical everywhere).
 */

const COPY = {
  en: {
    intro:
      "If you only need a break, pause your profile instead. Pausing hides you everywhere and keeps everything, and you can undo it any time.",
    whatHappens: "What happens when you delete",
    grace: "Nothing is deleted for 14 days. You can cancel any time before then.",
    removed: "Your name, photos, bio, contact details and profile are removed. You can no longer sign in.",
    kept: "Bookings and payment records are kept for 5 years with your name and contact details removed. The law requires us to keep them.",
    messages: "Messages you sent stay visible to the people you wrote to, shown as \"Deleted user\". Files you shared are removed.",
    typeToConfirm: "To confirm, type DELETE",
    start: "Delete my account",
    confirm: "Request deletion",
    back: "Keep my account",
    pendingTitle: "Your account is scheduled for deletion",
    pendingOn: "Deletion date",
    processing: "Deletion is in progress and can no longer be cancelled.",
    cancel: "Cancel deletion",
    blockedTitle: "These need to be finished first. Your request is saved and will go ahead once they are clear:",
    blockersNow: "Before your account can be deleted, these need to be finished:",
    loading: "Loading",
    error: "Something went wrong. Please try again.",
    mismatch: "Type DELETE to confirm.",
    alreadyProcessing: "Deletion has already started.",
    blockers: {
      future_booking: "Upcoming bookings ({n}). Finish or cancel them.",
      payout_pending: "Payouts not yet sent to you ({n}).",
      balance_on_account: "Money on your account. Ask for it back or spend it first.",
      balance_owed: "Bookings with a balance still to pay ({n}).",
      workspace_has_team: "A workspace you own still has team members ({n}). Transfer it first.",
    } satisfies Record<BlockerCode, string>,
  },
  es: {
    intro:
      "Si solo necesitas un descanso, pausa tu perfil. Pausar te oculta en todas partes y conserva todo, y puedes deshacerlo cuando quieras.",
    whatHappens: "Qué pasa al eliminar tu cuenta",
    grace: "No se elimina nada durante 14 días. Puedes cancelar en cualquier momento antes.",
    removed: "Se eliminan tu nombre, fotos, biografía, datos de contacto y perfil. Ya no podrás iniciar sesión.",
    kept: "Las reservas y los registros de pago se conservan 5 años sin tu nombre ni tus datos de contacto. La ley nos obliga a conservarlos.",
    messages: "Los mensajes que enviaste siguen visibles para las personas a las que escribiste, como \"Usuario eliminado\". Los archivos que compartiste se eliminan.",
    typeToConfirm: "Para confirmar, escribe ELIMINAR",
    start: "Eliminar mi cuenta",
    confirm: "Solicitar eliminación",
    back: "Conservar mi cuenta",
    pendingTitle: "Tu cuenta está programada para eliminarse",
    pendingOn: "Fecha de eliminación",
    processing: "La eliminación está en curso y ya no se puede cancelar.",
    cancel: "Cancelar eliminación",
    blockedTitle: "Primero hay que terminar esto. Tu solicitud queda guardada y seguirá adelante cuando esté resuelto:",
    blockersNow: "Antes de poder eliminar tu cuenta, hay que terminar esto:",
    loading: "Cargando",
    error: "Algo salió mal. Inténtalo de nuevo.",
    mismatch: "Escribe ELIMINAR para confirmar.",
    alreadyProcessing: "La eliminación ya comenzó.",
    blockers: {
      future_booking: "Reservas próximas ({n}). Termínalas o cancélalas.",
      payout_pending: "Pagos que aún no se te han enviado ({n}).",
      balance_on_account: "Saldo en tu cuenta. Pide su devolución o úsalo primero.",
      balance_owed: "Reservas con saldo pendiente de pago ({n}).",
      workspace_has_team: "Un espacio de trabajo tuyo aún tiene miembros del equipo ({n}). Transfiérelo primero.",
    } satisfies Record<BlockerCode, string>,
  },
} as const;

function formatDate(iso: string, es: boolean): string {
  try {
    return new Date(iso).toLocaleDateString(es ? "es" : "en", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function AccountDeletionCard({
  surface,
  es = false,
  onPause,
}: {
  surface: DeletionSurface;
  es?: boolean;
  /** Optional link to the pause control on this surface. */
  onPause?: () => void;
}) {
  const c = es ? COPY.es : COPY.en;
  const [loaded, setLoaded] = useState(false);
  const [request, setRequest] = useState<DeletionRequestView | null>(null);
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    void getAccountDeletionStatus()
      .then((res) => {
        if (!live) return;
        if (res.ok) {
          setRequest(res.request);
          setBlockers(res.blockers);
        } else {
          setError(c.error);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (live) {
          setError(c.error);
          setLoaded(true);
        }
      });
    return () => {
      live = false;
    };
  }, [c.error]);

  const errorFor = (code: string) =>
    code === "confirm_mismatch" ? c.mismatch : code === "already_processing" ? c.alreadyProcessing : c.error;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await requestAccountDeletion({ confirm: typed, surface });
      if (!res.ok) return setError(errorFor(res.error));
      setRequest(res.request);
      setBlockers(res.blockers);
      setConfirming(false);
      setTyped("");
    });
  };

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelAccountDeletion();
      if (!res.ok) return setError(errorFor(res.error));
      setRequest(null);
      setBlockers(res.blockers);
    });
  };

  const blockerList = blockers.length > 0 && (
    <ul className="m-0 mt-1 list-disc pl-5 text-[13px] text-admin-ink">
      {blockers.map((b) => (
        <li key={b.code}>{c.blockers[b.code].replace("{n}", String(b.count))}</li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-3 text-[13px] text-admin-ink" data-testid="account-deletion-card">
      {!loaded ? (
        <div className="text-admin-ink-muted">{c.loading}</div>
      ) : request ? (
        <div className="flex flex-col gap-2">
          <div className="font-semibold">{c.pendingTitle}</div>
          <div>
            {c.pendingOn}: <strong>{formatDate(request.scheduledFor, es)}</strong>
          </div>
          {blockers.length > 0 && (
            <div>
              <div className="text-admin-ink-muted">{c.blockedTitle}</div>
              {blockerList}
            </div>
          )}
          {request.status === "processing" ? (
            <div className="text-admin-ink-muted">{c.processing}</div>
          ) : (
            <div>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="rounded-md border border-admin-border bg-admin-card px-3 py-1.5 text-[13px] font-semibold text-admin-ink disabled:opacity-60"
                data-testid="account-deletion-cancel"
              >
                {c.cancel}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="m-0">
            {c.intro}
            {onPause && (
              <>
                {" "}
                <button type="button" onClick={onPause} className="font-semibold text-admin-ink underline">
                  {es ? "Pausar mi perfil" : "Pause my profile"}
                </button>
              </>
            )}
          </p>
          <div>
            <div className="font-semibold">{c.whatHappens}</div>
            <ul className="m-0 mt-1 list-disc pl-5 text-admin-ink-muted">
              <li>{c.grace}</li>
              <li>{c.removed}</li>
              <li>{c.kept}</li>
              <li>{c.messages}</li>
            </ul>
          </div>
          {blockers.length > 0 && (
            <div>
              <div className="text-admin-ink-muted">{c.blockersNow}</div>
              {blockerList}
            </div>
          )}
          {!confirming ? (
            <div>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md border border-admin-critical bg-admin-card px-3 py-1.5 text-[13px] font-semibold text-admin-critical"
                data-testid="account-deletion-start"
              >
                {c.start}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span>{c.typeToConfirm}</span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  className="rounded-md border border-admin-border bg-admin-card px-2 py-1.5 text-[13px] text-admin-ink"
                  data-testid="account-deletion-confirm-input"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || typed.trim().length === 0}
                  className="rounded-md bg-admin-critical px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
                  data-testid="account-deletion-confirm"
                >
                  {c.confirm}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setTyped("");
                  }}
                  className="rounded-md border border-admin-border bg-admin-card px-3 py-1.5 text-[13px] font-semibold text-admin-ink"
                >
                  {c.back}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <div className="text-admin-critical">{error}</div>}
    </div>
  );
}
