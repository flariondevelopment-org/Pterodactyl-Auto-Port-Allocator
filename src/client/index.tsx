import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

export default definePterodactylExtension({
    setup({ screens }) {
        screens.register('server-ports', () => import('./screens/ServerScreen'));
        screens.register('admin-rules', () => import('./screens/AdminScreen'));
    },
});
