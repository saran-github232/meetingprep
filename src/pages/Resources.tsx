import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, firestore, storage, firebaseConfigured } from "../lib/firebase";
import { useFirebaseAuth, signIn, signUp, signOutUser } from "../lib/useFirebaseAuth";

const CATEGORIES = [
  { id: "resume", label: "Resume" },
  { id: "certificate", label: "Certificate" },
  { id: "portfolio", label: "Portfolio" },
  { id: "reference", label: "Reference" },
  { id: "video", label: "Video" },
  { id: "other", label: "Other" },
];

interface ResourceDoc {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: "file" | "link";
  fileURL?: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  driveLink?: string;
  createdBy: string;
  createdAt: Timestamp | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SignInPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm card space-y-3 p-5">
      <h2 className="text-lg font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h2>
      <input
        type="email"
        placeholder="Email"
        className="input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        className="input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !email || !password}
        className="w-full btn-primary"
      >
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
        className="w-full text-xs text-faint underline"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<"file" | "link">("file");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !storage || !firestore) return;
    if (kind === "file" && !file) return;
    if (kind === "link" && !driveLink.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const base = {
        name: name.trim(),
        description: description.trim(),
        category,
        createdBy: auth?.currentUser?.email ?? "unknown",
        createdAt: serverTimestamp(),
      };
      if (kind === "file" && file) {
        const storagePath = `resources/${Date.now()}-${file.name}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        const fileURL = await getDownloadURL(storageRef);
        await addDoc(collection(firestore, "resources"), {
          ...base,
          kind: "file",
          fileURL,
          storagePath,
          mimeType: file.type,
          sizeBytes: file.size,
        });
      } else {
        await addDoc(collection(firestore, "resources"), {
          ...base,
          kind: "link",
          driveLink: driveLink.trim(),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-md space-y-4 p-5 shadow-pop">
        <h2 className="text-lg font-semibold">Add Resource</h2>

        <div className="flex gap-2">
          {(["file", "link"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`chip ${
                kind === k
                  ? "chip-active"
                  : "chip-idle"
              }`}
            >
              {k === "file" ? "Upload file" : "Paste link"}
            </button>
          ))}
        </div>

        {kind === "file" ? (
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.rtf,.odt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        ) : (
          <input
            placeholder="https://drive.google.com/… or https://youtube.com/…"
            className="input"
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
          />
        )}

        <div>
          <label className="section-label">Name</label>
          <input
            className="mt-1 input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="section-label">Category</label>
          <select
            className="mt-1 input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="section-label">
            Description
          </label>
          <textarea
            className="mt-1 input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || (kind === "file" ? !file : !driveLink.trim())}
            className="btn-primary"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Resources() {
  const { configured, loading, user, isAdmin } = useFirebaseAuth();
  const [rows, setRows] = useState<ResourceDoc[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (!firestore || !user) return;
    const q = query(collection(firestore, "resources"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceDoc, "id">) })));
    });
  }, [user]);

  async function remove(row: ResourceDoc) {
    if (!firestore || !confirm(`Delete "${row.name}"?`)) return;
    if (row.storagePath && storage) {
      await deleteObject(ref(storage, row.storagePath)).catch(() => {});
    }
    await deleteDoc(doc(firestore, "resources", row.id));
  }

  if (!configured) {
    return (
      <div className="page max-w-2xl">
        <h1 className="page-title mb-2">Resources</h1>
        <p className="text-sm text-gold">
          Firebase isn't configured yet. Add the <code>VITE_FIREBASE_*</code> values to <code>.env</code>{" "}
          (see README &gt; "Resources (Admin/User) setup") and restart the app.
        </p>
      </div>
    );
  }

  return (
    <div className="page max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="page-title">Resources</h1>
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-faint">
              {user.email} {isAdmin && <span className="text-accent">· Admin</span>}
            </span>
            {isAdmin && (
              <button
                onClick={() => setShowUpload(true)}
                className="btn-primary"
              >
                Upload Resource
              </button>
            )}
            <button
              onClick={signOutUser}
              className="btn-secondary btn-xs"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
      <p className="text-[13.5px] leading-relaxed text-muted mb-6">
        Shared documents and video links published by an Admin — resumes, certificates, portfolio pieces,
        or reference material.
      </p>

      {loading && <p className="text-sm text-faint">Loading…</p>}

      {!loading && !user && <SignInPanel />}

      {!loading && user && (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="card p-5 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{r.name}</span>
                  <span className="badge border-hairline bg-raised text-muted shrink-0">
                    {CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category}
                  </span>
                </div>
                {r.description && (
                  <p className="text-sm text-muted mt-1 whitespace-pre-wrap">
                    {r.description}
                  </p>
                )}
                <p className="text-xs text-faint mt-1">
                  {r.kind === "file"
                    ? `${r.sizeBytes ? formatBytes(r.sizeBytes) : ""} · uploaded by ${r.createdBy}`
                    : `link · added by ${r.createdBy}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={r.kind === "file" ? r.fileURL : r.driveLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-xs"
                >
                  Open
                </a>
                {isAdmin && (
                  <button onClick={() => remove(r)} className="text-xs text-faint hover:text-danger">
                    delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-[13.5px] leading-relaxed text-muted">
              No resources published yet{isAdmin ? " — upload the first one." : "."}
            </p>
          )}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}
