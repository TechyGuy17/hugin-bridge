import WB from "kryptokrona-wallet-backend-js";
import * as fs from "fs";
import {CryptoNote} from "kryptokrona-utils";
import {toHex} from "./utils.js";

const NODE = 'blocksum.org'
const PORT = 11898
let daemon

let wallet
export let myAddress

const xkrUtils = new CryptoNote()

const startWallet = async () => {
    //Start sync process

    wallet = await logIntoWallet()

    await wallet.start();

    const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();

    if (walletBlockCount === 0) {
        await wallet.reset(networkBlockCount - 100)
    }

    //Bridge wallet address
    myAddress = wallet.getPrimaryAddress()
    console.log(myAddress)

    wallet.on('heightchange', async (walletBlockCount, localDaemonBlockCount, networkBlockCount) => {
        console.log('SYNC: ' + walletBlockCount, 'local: ' + localDaemonBlockCount, 'network: '+ networkBlockCount)
        console.log('BALANCE: ' + await wallet.getBalance())
    })
}

const logIntoWallet = async () => {
    const [wallet, error] = await WB.WalletBackend.openWalletFromFile(daemon, './bridge.wallet', 'hugin123');
    if (error) {
        console.log('Failed to open wallet: ' + error.toString());
    }
    return wallet
}

try {
    //Create a wallet if we don't have one
    if (!(fs.existsSync('./bridge.wallet'))) {
        console.log('Creating wallet')
        const wallet = await WB.WalletBackend.createWallet(daemon);

        console.log('Saving wallet')
        const saved = wallet.saveWalletToFile('./bridge.wallet', 'hugin123')

        console.log(saved)
        if (!saved) {
            console.log('Failed to save wallet!');
        }
    }

    daemon = new WB.Daemon(NODE, PORT)

    //Start wallet
    await startWallet()

} catch (err) {
    console.error(err)
}

export const sendHuginMessage = async (nickname, message) => {
    console.log(`Sent Hugin message`)
    console.log(`${nickname}: ${message}`)

    let payload_hex;

    try {

        let  timestamp = parseInt(Date.now()/1000);
        let [privateSpendKey, privateViewKey] = wallet.getPrimaryAddressPrivateKeys();
        let signature = await xkrUtils.signMessage(message, privateSpendKey);

        let payload_json = {
            "m": message,
            "k": myAddress,
            "s": signature,
            "brd": "Home",
            "t": timestamp,
            "n": `Discord - ${nickname} `
        };

        await optimizeMessages()
        payload_hex = toHex(JSON.stringify(payload_json))

        let result = await wallet.sendTransactionAdvanced(
            [[myAddress, 1]], // destinations,
            3, // mixin
            {fixedFee: 10000, isFixedFee: true}, // fee
            undefined,
            undefined,
            undefined,
            true,
            false,
            Buffer.from(payload_hex, 'hex')
        );

        if (result.success) {
            console.log(`Sent transaction, hash ${result.transactionHash}, fee ${WB.prettyPrintAmount(result.fee)}`);
        } else {
            console.log(`Failed to send transaction: ${result.error.toString()}`);
        }

    } catch(err) {
        console.log('Error', err);
    }
}

async function optimizeMessages(nbrOfTxs) {
    console.log('optimize');
    try {

        const [walletHeight, localHeight, networkHeight] = wallet.getSyncStatus();
        let inputs = await wallet.subWallets.getSpendableTransactionInputs(wallet.subWallets.getAddresses(), networkHeight);
        if (inputs.length > 8) {
            console.log('enough inputs');
            return;
        }
        let subWallets = wallet.subWallets.subWallets

        subWallets.forEach((value, name) => {
            let txs = value.unconfirmedIncomingAmounts.length;

            if (txs > 0) {
                console.log('Already have incoming inputs, aborting..');
            }
        })

        let payments = [];
        let i = 0;
        /* User payment */
        while (i < nbrOfTxs - 1 && i < 10) {
            payments.push([
                wallet.subWallets.getAddresses()[0],
                10000
            ]);

            i += 1;

        }

        let result = await wallet.sendTransactionAdvanced(
            payments, // destinations,
            3, // mixin
            {fixedFee: 10000, isFixedFee: true}, // fee
            undefined, //paymentID
            undefined, // subWalletsToTakeFrom
            undefined, // changeAddress
            true, // relayToNetwork
            false, // sendAll
            undefined
        );

        console.log('optimize completed');
        return result;


    } catch (err) {
        console.log('error optimizer', err);
    }

}