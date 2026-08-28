import { useEffect, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

export default function CollectionDeleteControl({ collection, itemCount, watchCount, onDelete, isDeleting, mobile = false }) {
  const [isConfirming, setIsConfirming] = useState(false);
  useEffect(() => setIsConfirming(false), [collection?.id]);
  if (!collection) return null;
  return (
    <div className={`collection-delete-control${mobile ? " is-mobile" : ""}`}>
      <button type="button" className="icon-button collection-delete-trigger" onClick={() => setIsConfirming(true)} aria-label={`Delete ${collection.name}`}><Trash2 size={14} /></button>
      {isConfirming && <div className="collection-delete-popover" role="alertdialog" aria-label={`Delete ${collection.name} permanently`}>
        <b>Delete {collection.name} permanently?</b>
        <span>{itemCount} Item{itemCount === 1 ? "" : "s"} and {watchCount} Watch{watchCount === 1 ? "" : "es"} will be removed with their captures and history.</span>
        <div><button type="button" className="danger-button" disabled={isDeleting} onClick={async () => { await onDelete(collection.id); setIsConfirming(false); }}>{isDeleting ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />} Delete Collection</button><button type="button" className="text-button" disabled={isDeleting} onClick={() => setIsConfirming(false)}>Cancel</button></div>
      </div>}
    </div>
  );
}
