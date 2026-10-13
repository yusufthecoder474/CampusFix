import { lazy, Suspense, useState } from "react";
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "./queries";
import { SessionProvider, useSession } from "./session";
import { Login } from "./Login";
const AppLayout = lazy(() =>
  import("./Layout").then((m) => ({ default: m.AppLayout })),
);
import { Alert, Loading, PageTitle } from "./components";
const RequestList = lazy(() =>
  import("./Requests").then((m) => ({ default: m.RequestList })),
);
const RequestForm = lazy(() =>
  import("./Requests").then((m) => ({ default: m.RequestForm })),
);
const RequestDetail = lazy(() =>
  import("./Requests").then((m) => ({ default: m.RequestDetail })),
);
export function ProtectedRoute() {
  const auth = useSession();
  if (auth.loading)
    return (
      <main className="boot">
        <Loading text="Checking your session…" />
      </main>
    );
  if (auth.error && !auth.session)
    return (
      <main className="boot">
        <Alert text={auth.error} />
        <button onClick={auth.retry}>Retry connection</button>
      </main>
    );
  return auth.session ? <Outlet /> : <Navigate to="/login" replace />;
}
function LoginRoute() {
  const auth = useSession(),
    navigate = useNavigate();
  if (auth.loading)
    return (
      <main className="boot">
        <Loading text="Checking your session…" />
      </main>
    );
  if (auth.session) return <Navigate to="/" replace />;
  return (
    <Login
      api={auth.api}
      notice={auth.notice}
      onLogin={(s) => {
        auth.accept(s);
        void navigate("/", { replace: true });
      }}
    />
  );
}
function Dashboard() {
  const { api, session } = useSession();
  return <RequestList api={api} role={session!.user.role} />;
}
function NewRequest() {
  const { api, session } = useSession();
  return session!.user.role === "student" ? (
    <RequestForm api={api} />
  ) : (
    <>
      <PageTitle
        title="Student access only"
        subtitle="Only students can submit maintenance requests."
      />
      <a href="#/">Return to requests</a>
    </>
  );
}
function Details() {
  const { api, session } = useSession(),
    { id } = useParams();
  return <RequestDetail api={api} id={id!} user={session!.user} />;
}
function NotFound() {
  return (
    <>
      <PageTitle
        title="Page not found"
        subtitle="Choose a page from the navigation."
      />
      <a href="#/">Return to requests</a>
    </>
  );
}
export function App() {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <HashRouter>
          <Suspense
            fallback={
              <main className="boot">
                <Loading text="Loading screen…" />
              </main>
            }
          >
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="new" element={<NewRequest />} />
                  <Route path="requests/:id" element={<Details />} />
                  <Route path="student" element={<Dashboard />} />
                  <Route path="coordinator" element={<Dashboard />} />
                  <Route path="technician" element={<Dashboard />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}
