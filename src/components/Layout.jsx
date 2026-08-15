import Global from "./Global";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return <Global><Outlet /></Global>;
}
