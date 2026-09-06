"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import type { AdminAccessList } from "@/lib/admin/access-handlers";

type PublicError = { error?: { code?: string; message?: string } };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & PublicError;
  if (!response.ok) throw new Error(body.error?.message || "The access change could not be completed.");
  return body;
}

export function AdminAccessPanel({ initialAccess }: { initialAccess: AdminAccessList }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>();
  const access = useQuery({
    queryKey: ["admin-access"],
    queryFn: () => requestJson<AdminAccessList>("/api/admin/access"),
    initialData: initialAccess,
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-access"] });
  const invite = useMutation({
    mutationFn: (expertEmail: string) => requestJson("/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: expertEmail }),
    }),
    onSuccess: () => {
      setEmail("");
      setStatus("Invitation sent.");
      void refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => requestJson(`/api/admin/invitations/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      setStatus("Invitation cancelled.");
      void refresh();
    },
  });
  const changeAccess = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "remove" | "restore" }) =>
      requestJson(`/api/admin/members/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, variables) => {
      setStatus(variables.action === "remove" ? "Expert access removed." : "Expert access restored.");
      void refresh();
    },
  });

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(undefined);
    invite.mutate(email);
  }

  const mutationError = invite.error || cancel.error || changeAccess.error;

  return (
    <section className="mt-[18px] grid gap-[18px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(18px,5vw,32px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]" aria-labelledby="access-heading">
      <div>
        <div>
          <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] leading-[1.5] text-[#536059]">Protected workspace</p>
          <h1 className="mt-2 mb-1 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]" id="access-heading">Expert access</h1>
          <p className="text-[#536059] leading-[1.5]">Invite verified reviewers and pause or restore their access.</p>
        </div>
      </div>

      <form className="grid gap-2 rounded-[22px] border border-[var(--line)] bg-white/70 p-[18px]" onSubmit={submitInvitation}>
        <label className="mt-2 text-[.82rem] font-extrabold" htmlFor="expert-email">Expert email</label>
        <div className="grid gap-2.5 min-[620px]:grid-cols-[1fr_auto]">
          <input
            className="w-full min-h-12 px-3.5 py-3 rounded-xl border border-[var(--line)] bg-white text-[var(--ink)]"
            id="expert-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="expert@example.org"
          />
          <button className="rounded-xl border-0 bg-[var(--marigold)] px-3.5 py-2.5 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-55 min-h-12" type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Invite expert"}
          </button>
        </div>
      </form>

      {mutationError ? <p className="m-0 mt-2 font-extrabold text-[#8b2e24]" role="alert">{mutationError.message}</p> : null}
      {status ? <p className="m-0 mt-2 font-extrabold text-[var(--green)]" role="status">{status}</p> : null}

      <section className="rounded-[22px] border border-[var(--line)] bg-white/70 p-[18px]" aria-labelledby="pending-heading">
        <h2 className="mb-3.5 text-[1.1rem]" id="pending-heading">Pending invitations</h2>
        {access.data.invitations.length === 0 ? <p className="m-0 text-[#69736e]">No pending invitations.</p> : (
          <ul className="grid gap-2.5 m-0 p-0 list-none">
            {access.data.invitations.map((invitation) => (
              <li className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-[var(--line)] rounded-[14px] bg-white" key={invitation.id}>
                <div><strong className="block wrap-anywhere">{invitation.email}</strong><small className="block wrap-anywhere mt-1 text-[#69736e]">Pending</small></div>
                <button
                  className="rounded-xl border-0 bg-[#eee5d8] px-3.5 py-2.5 font-extrabold text-[var(--green)] min-h-11"
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(invitation.id)}
                  aria-label={`Cancel invitation for ${invitation.email}`}
                >Cancel</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-white/70 p-[18px]" aria-labelledby="experts-heading">
        <h2 className="mb-3.5 text-[1.1rem]" id="experts-heading">Experts</h2>
        {access.data.members.length === 0 ? <p className="m-0 text-[#69736e]">No experts yet.</p> : (
          <ul className="grid gap-2.5 m-0 p-0 list-none">
            {access.data.members.map((member) => {
              const removed = member.role === "revoked";
              return (
                <li className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-[var(--line)] rounded-[14px] bg-white" key={member.id}>
                  <div>
                    <strong className="block wrap-anywhere">{member.user.name}</strong>
                    <small className="block wrap-anywhere mt-1 text-[#69736e]">{member.user.email} · {removed ? "Access removed" : member.role === "owner" ? "Administrator" : "Expert"}</small>
                  </div>
                  {member.role !== "owner" ? (
                    <button
                      className="rounded-xl border-0 bg-[#eee5d8] px-3.5 py-2.5 font-extrabold text-[var(--green)] min-h-11"
                      type="button"
                      disabled={changeAccess.isPending}
                      onClick={() => {
                        if (!removed && !window.confirm(`Remove ${member.user.name}'s expert access?`)) return;
                        setStatus(undefined);
                        changeAccess.mutate({ id: member.id, action: removed ? "restore" : "remove" });
                      }}
                      aria-label={`${removed ? "Restore" : "Remove"} ${member.user.name}'s access`}
                    >{removed ? "Restore" : "Remove access"}</button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
