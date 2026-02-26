import { Connector } from '@starknet-react/core';
import { AccountInterface, ProviderInterface } from 'starknet';
import { StarkSDK } from 'starkzap';
import { RequestFnCall, RpcMessage, RpcTypeToMessageMap } from '@starknet-io/types-js';

// Define the types that aren't exported by starknet-react
type ConnectorIcons = {
    light: string;
    dark: string;
} | string;

type ConnectorData = {
    account?: string;
    chainId?: bigint;
};

// Map Cartridge Controller as any since we don't have its types handy
type ControllerAny = any;

export class StarkzapConnector extends Connector {
    private sdk: StarkSDK;
    private options: any;
    private cartridgeWallet: any | null = null;
    private controller: ControllerAny = null;
    private _account: AccountInterface | null = null;

    constructor(options: {
        sdk: StarkSDK;
        policies?: any[];
        defaultChainId?: string;
    }) {
        super();
        this.sdk = options.sdk;
        this.options = options;
    }

    get id(): string {
        return 'cartridge-starkzap';
    }

    get name(): string {
        return 'Cartridge';
    }

    get icon(): ConnectorIcons {
        return {
            light: 'https://cartridge.gg/favicon.ico',
            dark: 'https://cartridge.gg/favicon.ico',
        };
    }

    available(): boolean {
        return true;
    }

    async ready(): Promise<boolean> {
        return true;
    }

    async connect(): Promise<ConnectorData> {
        try {
            console.log("StarkzapConnector: Connecting via Cartridge...");
            this.cartridgeWallet = await this.sdk.connectCartridge({
                policies: this.options.policies,
                feeMode: "sponsored",
            });
            console.log("StarkzapConnector: Connected!");

            this.controller = this.cartridgeWallet.getController();
            this._account = this.cartridgeWallet.getAccount() as unknown as AccountInterface;

            return {
                account: this.cartridgeWallet.address,
                chainId: await this.chainId(),
            };
        } catch (error) {
            console.error("StarkzapConnector: Error connecting", error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.controller && typeof this.controller.disconnect === 'function') {
            await this.controller.disconnect();
        }
        this.cartridgeWallet = null;
        this.controller = null;
        this._account = null;
    }

    async account(): Promise<AccountInterface> {
        if (this._account) {
            return this._account;
        }
        throw new Error("Not connected");
    }

    async provider(): Promise<ProviderInterface> {
        return this.sdk.getProvider() as ProviderInterface;
    }

    async chainId(): Promise<bigint> {
        if (this.options.defaultChainId) {
            if (this.options.defaultChainId.startsWith('0x')) {
                return BigInt(this.options.defaultChainId);
            }
            // Assume it's a dec string if not starting with 0x
            return BigInt(this.options.defaultChainId);
        }
        return BigInt("0x534e5f5345504f4c4941"); // Sepolia by default
    }

    // @ts-ignore - Ignore type mismatches from duplicate `@starknet-io/types-js` dependency versions
    async request<T extends RpcMessage["type"]>(call: RequestFnCall<T>): Promise<RpcTypeToMessageMap[T]["result"]> {
        if (!this.controller) {
            throw new Error("Not connected to Cartridge");
        }

        try {
            if (typeof this.controller.request === 'function') {
                return await this.controller.request(call) as RpcTypeToMessageMap[T]["result"];
            }
            throw new Error("Controller does not support request method");
        } catch (error) {
            console.error("StarkzapConnector: request error", error);
            throw error;
        }
    }
}
