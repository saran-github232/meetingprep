import HistoryList from "../components/HistoryList";

export default function Favorites() {
  return (
    <div className="page max-w-3xl">
      <h1 className="page-title">Favorites</h1>
      <p className="page-sub">Your starred answers, ready for quick recall.</p>
      <HistoryList favoritesOnly={true} />
    </div>
  );
}
