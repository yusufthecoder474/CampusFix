# React hooks used in CampusFix

| Hook        | Real use                                                                        | Reason                                                                                 |
| ----------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| useState    | Controlled filters/forms, dialog choice, notification visibility, session state | Local UI state changes independently of database state                                 |
| useEffect   | Session bootstrap, Socket.IO lifecycle, page focus/title                        | Synchronizes React with external network/DOM systems; cleanup aborts/removes listeners |
| useContext  | useSession reads AuthContext                                                    | Shares session/API access without repeated prop chains                                 |
| useRef      | Dialog/page heading focus and socket/version map                                | Keeps DOM or external-system references across renders without causing a render        |
| useMemo     | Session Context value                                                           | Stabilizes the shared object; not a claim of faster expensive computation              |
| useCallback | Session expiration, acceptance, retry and logout callbacks                      | Keeps callbacks stable for dependent effects, particularly socket cleanup/reconnection |

TanStack Query hooks manage server state; they are not a substitute for understanding the React lifecycle. The socket effect lists its session/client/expiration dependencies, registers named handlers and removes those exact handlers and manager listeners on cleanup. Tests verify a rerender does not create an extra connection.

No expensive 50-row calculation justified artificial useMemo or React.memo. There is no measured render-time improvement claim. The concrete optimization measured is fresh query reuse and route chunking, with the bundle trade-off documented separately.
