import { ChevronRight } from "lucide-react";
import { EmptyNestIcon } from "../../components/icons.jsx";

export default function EmptyCollection({ onSelect }) {
  return (
    <div className="empty-collection">
      <div className="empty-icon"><EmptyNestIcon size={25} /></div>
      <h2>Your first Item is waiting.</h2>
      <p>Clip any product, listing, recipe, or article. Magpie will organize it into the right Collection automatically.</p>
      <button className="text-button" onClick={onSelect}>See how the capture flow works <ChevronRight size={16} /></button>
      <div className="capture-steps">
        <span><b>1</b> Clip an element</span>
        <span><b>2</b> Magpie organizes it</span>
        <span><b>3</b> Watch it change</span>
      </div>
    </div>
  );
}
