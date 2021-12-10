import * as anchor from '@project-serum/anchor';
import * as spl from '@solana/spl-token';
import { Program } from '@project-serum/anchor';
import { AnchorAirdrop } from '../target/types/anchor_airdrop';
import assert = require('assert');

describe('anchor-airdrop', () => {

  const INITIAL_TOKEN_MINT_AMOUNT = 10_000_000;
  const AIRDROP_TOKEN_AMOUNT = 1_000_000;
  const MAX_NUM_USERS = 11;
  const LAMPORTS_PER_SOL = 1_000_000_000;
  const AIRDROP_SOL_AMT = 1_000 * LAMPORTS_PER_SOL;

  const provider = anchor.Provider.env();

  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorAirdrop as Program<AnchorAirdrop>;

  let programAuthority;

  let programAuthorityBump;

  const us = program.provider.wallet;

  const users: Keypair[] = Array.from({length: MAX_NUM_USERS}, (_) => {
    const kp = anchor.web3.Keypair.generate();
    return kp;
  });

  let mint;

  const airdrop = anchor.web3.Keypair.generate();

  const airdropTokens = anchor.web3.Keypair.generate();

  let signerTokenAccount;

  before( async() => {
    for (const user of users) {
      await provider.connection.requestAirdrop(user.publicKey, AIRDROP_SOL_AMT);
    }

    const [_programAuthority, _programAuthorityBump] = await anchor.web3.PublicKey.findProgramAddress(
      ["authority"],
      program.programId
    );

    programAuthority = _programAuthority;

    programAuthorityBump = _programAuthorityBump;

    mint = await spl.Token.createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9,
      spl.TOKEN_PROGRAM_ID,
    );

  });

  it('Is initialized!', async () => {
    signerTokenAccount = await mint.createAccount(us.publicKey);

    await mint.mintTo(signerTokenAccount, provider.wallet.payer, [], INITIAL_TOKEN_MINT_AMOUNT);

    debugger;

    await program.rpc.initialize(
      new anchor.BN(programAuthorityBump),
      new anchor.BN(AIRDROP_TOKEN_AMOUNT),
      {
        accounts: {
          signer: us.publicKey,
          airdrop: airdrop.publicKey,
          tokenMint: mint.publicKey,
          signerTokenAccount: signerTokenAccount,
          airdropTokens: airdropTokens.publicKey,
          programAuthority: programAuthority,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [airdrop, airdropTokens],
      }
    );

    let airdropTokensAccount = await mint.getAccountInfo(airdropTokens.publicKey);
    assert.equal(airdropTokensAccount.amount.toNumber(), AIRDROP_TOKEN_AMOUNT);
    let signerTokenAccountInfo = await mint.getAccountInfo(signerTokenAccount);
    assert.equal(signerTokenAccountInfo.amount.toNumber(), INITIAL_TOKEN_MINT_AMOUNT - AIRDROP_TOKEN_AMOUNT);

  });

  it('Allows a user to join the airdrop', async () => {
    debugger;

    const tempAcct = anchor.web3.Keypair.generate();

    const programId = new anchor.web3.PublicKey(program.idl.metadata.address);

    const transaction = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: users[0].publicKey,
        lamports: 1 * LAMPORTS_PER_SOL,
        newAccountPubkey: tempAcct.publicKey,
        programId: programId,
        space: 256,
      })
    );

    const signature = await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      transaction,
      [users[0], tempAcct],
    );

    const airdropBalancePrior = await provider.connection.getAccountInfo(airdrop.publicKey);

    await program.rpc.join(
      {
        accounts: {
          user: users[0].publicKey,
          airdrop: airdrop.publicKey,
          airdropOwnedLamports: tempAcct.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [],
      }
    );

    const airdropAccount = await program.account.airdrop.fetch(airdrop.publicKey);
    assert.equal(airdropAccount.userList[0].toBase58(), users[0].publicKey.toBase58());
    const airdropBalanceAfter = await provider.connection.getAccountInfo(airdrop.publicKey);
    assert.equal(airdropBalanceAfter.lamports, airdropBalancePrior.lamports + LAMPORTS_PER_SOL);

    // console.log(await provider.connection.getAccountInfo(tempAcct.publicKey))
    // console.log(await provider.connection.getAccountInfo(airdrop.publicKey))
    // console.log(await program.account.airdrop.fetch(airdrop.publicKey))
  });

  it('Removes a user from userlist', async () => {
    const userBalancePrior = await provider.connection.getBalance(users[0].publicKey);
    const airdropAccountPrior = await provider.connection.getAccountInfo(airdrop.publicKey);

    await program.rpc.leave({
      accounts: {
        user: users[0].publicKey,
        airdrop: airdrop.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [],
    });

    const airdropAccount = await program.account.airdrop.fetch(airdrop.publicKey);
    assert.equal(airdropAccount.userList.length, 0);
    const userBalanceAfter = await provider.connection.getBalance(users[0].publicKey);
    assert.equal(userBalanceAfter, userBalancePrior + LAMPORTS_PER_SOL);
    const airdropAccountAfter = await provider.connection.getAccountInfo(airdrop.publicKey);
    assert.equal(airdropAccountAfter.lamports, airdropAccountPrior.lamports - LAMPORTS_PER_SOL);
  })

  it('Fails to add more than MAX_NUM_USERS', async () => {
    const tempAcct = anchor.web3.Keypair.generate();
    const programId = new anchor.web3.PublicKey(program.idl.metadata.address);
    try {
      for (const user of users) {
        const transaction = new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.createAccount({
            fromPubkey: user.publicKey,
            lamports: 1 * LAMPORTS_PER_SOL,
            newAccountPubkey: tempAcct.publicKey,
            programId: programId,
            space: 256,
          })
        );

        const signature = await anchor.web3.sendAndConfirmTransaction(
          provider.connection,
          transaction,
          [user, tempAcct],
        );

        await program.rpc.join(
          {
            accounts: {
              user: user.publicKey,
              airdrop: airdrop.publicKey,
              airdropOwnedLamports: tempAcct.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
            },
            signers: [],
          }
        );

      }
    } catch (err) {
      assert.equal(err.code, 300);
    }
  });
});
