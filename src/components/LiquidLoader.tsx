// Apple-style "liquid glass" loading bar — a smooth indeterminate shimmer that
// glides across a frosted, translucent track. Drop it anywhere; show when busy.
type Props = {
  active?: boolean;        // show/hide
  className?: string;
};

export default function LiquidLoader({ active = true, className = "" }: Props) {
  return (
    <div
      className={`liquid-loader ${active ? "is-active" : ""} ${className}`}
      aria-hidden={!active}
    >
      <div className="liquid-loader__track">
        <div className="liquid-loader__glass" />
        <div className="liquid-loader__beam" />
        <div className="liquid-loader__beam liquid-loader__beam--2" />
      </div>
    </div>
  );
}
