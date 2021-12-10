use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
};
use std::mem;

declare_id!("iFg9jmmegPPhwB7PTnoPQQKutjYHqCMwc8ygH3kj2cg");

static SEED: &[u8] = b"authority";

#[program]
pub mod anchor_airdrop {
    use super::*;
    pub fn initialize(
        ctx: Context<Initialize>,
        _authority_bump: u8,
        airdrop_token_amount: u64
    ) -> ProgramResult {
        let airdrop = &mut ctx.accounts.airdrop;

        airdrop.max_users = Airdrop::MAX_NUM_USERS as u64;

        airdrop.token_mint = ctx.accounts.token_mint.key();

        airdrop.token_amount = airdrop_token_amount;

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.signer_token_account.to_account_info(),
                    to: ctx.accounts.airdrop_tokens.to_account_info(),
                    authority: ctx.accounts.signer.to_account_info(),
                },
            ),
            airdrop_token_amount,
        )?;

        Ok(())
    }

    pub fn join(
        ctx: Context<Join>
    ) -> Result<()> {
        let user_list = &ctx.accounts.airdrop.user_list;

        let max_users = ctx.accounts.airdrop.max_users;

        let user = ctx.accounts.user.to_account_info();

        if user_list.len() == max_users as usize {
            return Err(ErrorCode::UserListFull.into())
        }

        for x in user_list.iter() {
            if *x == user.key() {
                return Err(ErrorCode::UserAlreadyInUserlist.into())
            }
        }

        let from = &mut ctx.accounts.airdrop_owned_lamports.to_account_info();

        let airdrop = &mut ctx.accounts.airdrop.to_account_info();

        **from.try_borrow_mut_lamports()? -= 1_000_000_000;

        **airdrop.try_borrow_mut_lamports()? += 1_000_000_000;

        ctx.accounts.airdrop.user_list.push(user.key());

        Ok(())
    }

    pub fn leave(
        ctx: Context<Leave>
    ) -> Result<()> {
        let user = ctx.accounts.user.to_account_info();

        let user_list = &mut ctx.accounts.airdrop.user_list;

        let index = user_list
            .iter()
            .position(|x| *x == user.key())
            .ok_or::<ErrorCode>(ErrorCode::UserNotInUserlist.into())
            .unwrap();

        user_list.remove(index);

        let airdrop = &mut ctx.accounts.airdrop.to_account_info();

        **airdrop.try_borrow_mut_lamports()? -= 1_000_000_000;

        **user.try_borrow_mut_lamports()? += 1_000_000_000;

        Ok(())
    }

    pub fn distribute(
        ctx: Context<Distribute>
    ) -> ProgramResult {
        let user_list = &ctx.accounts.airdrop.user_list;

        let num_users = user_list.len();

        let token_distribution_amount = &ctx.accounts.airdrop.token_amount / num_users as u64;

        // for user in user_list {
        //     anchor_spl::token::transfer(
        //         CpiContext::new(
        //             ctx.accounts.token_program.to_account_info(),
        //             anchor_spl::token::Transfer {
        //                 from: ctx.accounts.airdrop.to_account_info(),
        //                 to: user,
        //                 authority: ctx.accounts.airdrop.to_account_info(),
        //             },
        //         ),
        //         token_distribution_amount,
        //     )?;
        // }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(authority_bump: u8)]
pub struct Initialize<'info> {
    signer: Signer<'info>,
    #[account(init, payer = signer, space = Airdrop::AIRDROP_SIZE)]
    airdrop: Account<'info, Airdrop>,
    token_mint: Account<'info, Mint>,
    #[account(mut)]
    signer_token_account: Account<'info, TokenAccount>,
    #[account(init, payer = signer, token::mint = token_mint, token::authority = program_authority)]
    airdrop_tokens: AccountInfo<'info>,
    #[account(seeds = [SEED], bump = authority_bump)]
    program_authority: AccountInfo<'info>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    user: AccountInfo<'info>,
    #[account(mut)]
    airdrop: Account<'info, Airdrop>,
    #[account(mut)]
    airdrop_owned_lamports: AccountInfo<'info>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Leave<'info> {
    #[account(mut)]
    user: AccountInfo<'info>,
    #[account(mut)]
    airdrop: Account<'info, Airdrop>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(mut)]
    airdrop: Account<'info, Airdrop>,
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct Airdrop {
    user_list: Vec<Pubkey>,
    token_accts: Vec<Pubkey>,
    max_users: u64,
    token_mint: Pubkey,
    token_amount: u64,
}

impl Airdrop {
    const MAX_NUM_USERS: usize = 10;
    const AIRDROP_SIZE: usize = 8 as usize
        + mem::size_of::<usize>() * 2
        + mem::size_of::<Pubkey>() * Airdrop::MAX_NUM_USERS as usize * 2
        + mem::size_of::<u64>()
        + mem::size_of::<Pubkey>()
        + mem::size_of::<u64>();
}

#[error]
pub enum ErrorCode {
    #[msg("Userlist is full")]
    UserListFull,
    #[msg("User not in userlist")]
    UserNotInUserlist,
    #[msg("User already in userlist")]
    UserAlreadyInUserlist,
}
