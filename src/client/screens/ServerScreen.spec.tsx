import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createExtensionTestHost, createTestServer } from '@pterodactyl/sdk/testing';
import ServerScreen from './ServerScreen';

const host = createExtensionTestHost({ extensionId: 'auto-port-allocator', server: createTestServer() });
afterEach(() => {
    cleanup();
    host.dispose();
});

test('renders inside the panel host', async () => {
    render(<ServerScreen />, { wrapper: host.Wrapper });
    expect(screen).toBeDefined();
});
