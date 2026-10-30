export interface EggVariable {
    id: number;
    egg_id: number;
    name: string;
    description?: string | null;
    env_variable: string;
    default_value: string;
}

export interface Egg {
    id: number;
    name: string;
    variables: EggVariable[];
}

export interface PortRange {
    start: number | '';
    end: number | '';
}

export interface SubRule {
    id: number;
    profile_id: number;
    name: string;
    env_variable: string;
    allocation_type: 'offset' | 'any_available' | 'range';
    offset_value: number | null;
    range_start: number | null;
    range_end: number | null;
    port_ranges?: Array<{ start: number; end: number }> | null;
    auto_create_allocation: boolean;
    is_required: boolean;
}

export interface GameProfile {
    id: number;
    egg_id: number;
    egg_ids?: number[] | null;
    name: string;
    description: string | null;
    primary_range_start: number | null;
    primary_range_end: number | null;
    primary_port_ranges?: Array<{ start: number; end: number }> | null;
    egg?: Egg;
    eggs?: Egg[];
    sub_rules?: SubRule[];
}

export const RESERVED_VARIABLES = [
    'SERVER_PORT',
    'SERVER_MEMORY',
    'SERVER_IP',
    'ENV',
    'HOME',
    'USER',
    'STARTUP',
    'SERVER_UUID',
    'UUID',
];

export const getProfileEggIds = (profile: GameProfile): number[] => {
    if (profile.egg_ids && Array.isArray(profile.egg_ids) && profile.egg_ids.length > 0) {
        return profile.egg_ids.map(Number);
    }
    return profile.egg_id ? [Number(profile.egg_id)] : [];
};
