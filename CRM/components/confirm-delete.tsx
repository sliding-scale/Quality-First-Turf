"use client";

/* The one way to confirm deleting something from a list: a small dialog with the title, a sentence on what happens (and what is kept), Cancel
   first and the danger button last. Deleting from inside an edit dialog confirms in that dialog's footer instead (Products, Materials, Material
   kits, Tasks), with the same wording: "Yes, delete". */

import { useState } from "react";
import { failure } from "@/lib/pipeline";
import { PipelineModal } from "./pipeline-dialogs";
import { useUI } from "./ui-provider";

export function ConfirmDelete({
  title,
  note,
  confirmLabel = "Delete",
  doneMessage,
  failMessage = "That could not be deleted.",
  action,
  onClose,
}: {
  title: string;
  note: string;
  confirmLabel?: string;
  doneMessage: string;
  failMessage?: string;
  action: () => Promise<unknown>;
  onClose: () => void;
}) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  return (
    <PipelineModal title={title} onClose={onClose} busy={busy}>
      {(close) => (
        <div>
          <p className="modal-note">{note}</p>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                action().then(() => { toast(doneMessage); close(); }).catch((e) => { toast(failure(e, failMessage)); setBusy(false); });
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}
