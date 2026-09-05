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
    <section className="admin-access" aria-labelledby="access-heading">
      <div className="admin-title-row">
        <div>
          <p className="eyebrow">Protected workspace</p>
          <h1 id="access-heading">Expert access</h1>
          <p>Invite verified reviewers and pause or restore their access.</p>
        </div>
      </div>

      <form className="admin-invite" onSubmit={submitInvitation}>
        <label htmlFor="expert-email">Expert email</label>
        <div>
          <input
            id="expert-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="expert@example.org"
          />
          <button className="primary-action" type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Invite expert"}
          </button>
        </div>
      </form>

      {mutationError ? <p className="admin-error" role="alert">{mutationError.message}</p> : null}
      {status ? <p className="admin-success" role="status">{status}</p> : null}

      <section className="admin-section" aria-labelledby="pending-heading">
        <h2 id="pending-heading">Pending invitations</h2>
        {access.data.invitations.length === 0 ? <p className="admin-empty">No pending invitations.</p> : (
          <ul className="access-list">
            {access.data.invitations.map((invitation) => (
              <li key={invitation.id}>
                <div><strong>{invitation.email}</strong><small>Pending</small></div>
                <button
                  className="secondary-action"
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

      <section className="admin-section" aria-labelledby="experts-heading">
        <h2 id="experts-heading">Experts</h2>
        {access.data.members.length === 0 ? <p className="admin-empty">No experts yet.</p> : (
          <ul className="access-list">
            {access.data.members.map((member) => {
              const removed = member.role === "revoked";
              return (
                <li key={member.id}>
                  <div>
                    <strong>{member.user.name}</strong>
                    <small>{member.user.email} · {removed ? "Access removed" : member.role === "owner" ? "Administrator" : "Expert"}</small>
                  </div>
                  {member.role !== "owner" ? (
                    <button
                      className="secondary-action"
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
