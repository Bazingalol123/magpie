import magpieMarkSrc from "../icon/magpie-mark.png";

export default function MagpieMark({ size = 28 }) {
  return <img src={magpieMarkSrc} alt="" className="magpie-mark" width={size} height={size} />;
}
