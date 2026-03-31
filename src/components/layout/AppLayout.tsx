import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      {/* md: has sidebar (w-16 or lg:w-56). mobile: no sidebar, bottom bar instead */}
      <div className="flex flex-1 flex-col md:pl-16 lg:pl-56">
        <AppTopbar />
        <main className="flex-1 p-3 pb-20 md:p-4 md:pb-6 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
