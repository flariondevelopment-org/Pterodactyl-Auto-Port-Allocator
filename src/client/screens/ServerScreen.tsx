import { useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    http,
    httpErrorToHuman,
    ServerContentBlock,
    Spinner,
    TitledGreyBox,
    toast,
    useCurrentServerRequired,
} from '@pterodactyl/sdk';

interface Allocation {
    id: number;
    ip: string;
    alias: string | null;
    port: number;
    is_default?: boolean;
}

interface AssignedRole {
    id: number;
    allocation_id: number;
    env_variable: string;
    port_name: string;
    allocation: Allocation;
}

interface EggRule {
    id: number;
    name: string;
    env_variable: string;
    allocation_type: string;
    offset_value: number | null;
    is_required: boolean;
}

interface ServerPortsData {
    primary_allocation: Allocation | null;
    all_allocations: Allocation[];
    assigned_roles: AssignedRole[];
    egg_rules: EggRule[];
    missing_rules: EggRule[];
}

export default function ServerScreen() {
    const server = useCurrentServerRequired();
    const [data, setData] = useState<ServerPortsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        try {
            setError(null);
            const response = await http.get(`/api/client/servers/${server.uuid}/extensions/auto-port-allocator/ports`);
            setData(response.data);
        } catch (err) {
            setError(httpErrorToHuman(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [server.uuid]);

    const handleSync = async () => {
        try {
            setSyncing(true);
            const response = await http.post(`/api/client/servers/${server.uuid}/extensions/auto-port-allocator/sync`);
            setData(response.data);
            toast.success('Port allocations synchronized successfully.');
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <ServerContentBlock title={'Port Allocator'}>
                <div className={'apa:flex apa:justify-center apa:items-center apa:p-12'}>
                    <Spinner size={'large'} />
                </div>
            </ServerContentBlock>
        );
    }

    const assignedRoleMap = new Map<number, AssignedRole>();
    data?.assigned_roles?.forEach((role) => {
        assignedRoleMap.set(role.allocation_id, role);
    });

    return (
        <ServerContentBlock title={'Port Allocations'}>
            <div className={'apa:space-y-6'}>
                {error && <Alert type={'danger'}>{error}</Alert>}

                {data && data.missing_rules.length > 0 && (
                    <Alert type={'warning'}>
                        <div className={'apa:flex apa:items-center apa:justify-between'}>
                            <div>
                                <p className={'apa:font-semibold'}>Missing Port Allocations</p>
                                <p className={'apa:text-sm'}>
                                    This server egg requires {data.missing_rules.length} additional port(s) that are not yet allocated:
                                    {' '}
                                    <span className={'apa:font-mono'}>
                                        {data.missing_rules.map((r) => `${r.name} (${r.env_variable})`).join(', ')}
                                    </span>
                                </p>
                            </div>
                            <Button isLoading={syncing} onClick={handleSync}>
                                Allocate Missing Ports
                            </Button>
                        </div>
                    </Alert>
                )}

                <TitledGreyBox title={'Allocated Game Ports & Services'}>
                    <div className={'apa:overflow-x-auto'}>
                        <table className={'apa:w-full apa:text-left apa:border-collapse'}>
                            <thead>
                                <tr className={'apa:border-b apa:border-muted apa:text-xs apa:text-muted-foreground apa:uppercase'}>
                                    <th className={'apa:py-3 apa:px-4'}>Service / Role</th>
                                    <th className={'apa:py-3 apa:px-4'}>Environment Key</th>
                                    <th className={'apa:py-3 apa:px-4'}>Connection Address</th>
                                    <th className={'apa:py-3 apa:px-4'}>Port</th>
                                    <th className={'apa:py-3 apa:px-4'}>Type</th>
                                </tr>
                            </thead>
                            <tbody className={'apa:divide-y apa:divide-muted'}>
                                {/* Primary Game Port */}
                                {data?.primary_allocation && (
                                    <tr className={'apa:hover:bg-muted/30'}>
                                        <td className={'apa:py-3 apa:px-4 apa:font-medium'}>
                                            <div className={'apa:flex apa:items-center apa:gap-2'}>
                                                <span>Primary Game Port</span>
                                                <Badge variant={'default'}>Primary</Badge>
                                            </div>
                                        </td>
                                        <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm apa:text-primary'}>
                                            SERVER_PORT
                                        </td>
                                        <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm'}>
                                            {data.primary_allocation.alias || data.primary_allocation.ip}
                                        </td>
                                        <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm apa:font-semibold'}>
                                            {data.primary_allocation.port}
                                        </td>
                                        <td className={'apa:py-3 apa:px-4'}>
                                            <Badge variant={'outline'}>Main</Badge>
                                        </td>
                                    </tr>
                                )}

                                {/* Secondary and mapped ports */}
                                {data?.all_allocations
                                    ?.filter((a) => a.id !== data.primary_allocation?.id)
                                    .map((allocation) => {
                                        const role = assignedRoleMap.get(allocation.id);
                                        return (
                                            <tr key={allocation.id} className={'apa:hover:bg-muted/30'}>
                                                <td className={'apa:py-3 apa:px-4 apa:font-medium'}>
                                                    {role ? (
                                                        <span className={'apa:text-foreground'}>{role.port_name}</span>
                                                    ) : (
                                                        <span className={'apa:text-muted-foreground'}>Additional Allocation</span>
                                                    )}
                                                </td>
                                                <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm apa:text-primary'}>
                                                    {role ? role.env_variable : '—'}
                                                </td>
                                                <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm'}>
                                                    {allocation.alias || allocation.ip}
                                                </td>
                                                <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm apa:font-semibold'}>
                                                    {allocation.port}
                                                </td>
                                                <td className={'apa:py-3 apa:px-4'}>
                                                    {role ? (
                                                        <Badge variant={'secondary'}>Auto-Allocated</Badge>
                                                    ) : (
                                                        <Badge variant={'outline'}>Manual</Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </TitledGreyBox>

                <div className={'apa:flex apa:justify-end'}>
                    <Button isLoading={syncing} onClick={handleSync}>
                        Sync & Check Allocations
                    </Button>
                </div>
            </div>
        </ServerContentBlock>
    );
}
