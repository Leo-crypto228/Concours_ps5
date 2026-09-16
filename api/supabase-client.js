const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vmmicbfoobdbtikcqxel.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtbWljYmZvb2JkYnRpa2NxeGVsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Nzc2ODY1NSwiZXhwIjoyMTAzMzQ0NjU1fQ.Ws3GGccCAzgZ9FcxpIOWN6O2yAVu70DsYJ-tLHpJFwY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Récupère les credentials d'un utilisateur
 */
async function getUserCredentials(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, password, google_email, google_password, status, proxy_used, session_cookies, session_fingerprint')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[SUPABASE] Erreur récupération user:', error);
    return null;
  }

  return data;
}

/**
 * Met à jour le statut d'un utilisateur
 */
async function updateUserStatus(userId, status, sessionData = null) {
  const update = { status, updated_at: new Date().toISOString() };
  if (sessionData) {
    update.session_cookies = sessionData.cookies;
    update.session_fingerprint = sessionData.fingerprint;
    update.proxy_used = sessionData.proxy;
    update.last_session_date = new Date().toISOString();
  }

  const { error } = await supabase
    .from('users')
    .update(update)
    .eq('id', userId);

  if (error) {
    console.error('[SUPABASE] Erreur mise à jour user:', error);
    return false;
  }

  return true;
}

/**
 * Récupère tous les utilisateurs en attente de validation
 */
async function getPendingUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, google_email, google_password, proxy_region')
    .eq('status', 'pending_validation')
    .limit(10);

  if (error) {
    console.error('[SUPABASE] Erreur récupération pending:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupère tous les utilisateurs avec session active
 */
async function getActiveSessions() {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, google_email, session_cookies, session_fingerprint, proxy_used')
    .eq('status', 'session_active')
    .not('session_cookies', 'is', null);

  if (error) {
    console.error('[SUPABASE] Erreur récupération actifs:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupère un utilisateur par son email Cademo (insensible à la casse)
 */
async function getUserByEmail(cademoEmail) {
  const cleanEmail = (cademoEmail || '').toLowerCase().trim();
  console.log('[SUPABASE] Recherche user par email:', cleanEmail);
  const { data, error } = await supabase
    .from('users')
    .select('id, email, password, google_email, google_password, status, updated_at, proxy_used, session_cookies, session_fingerprint')
    .ilike('email', cleanEmail)
    .limit(1);

  if (error) {
    console.error('[SUPABASE] Erreur récupération par email:', error);
    return null;
  }

  const user = (data && data[0]) || null;
  console.log('[SUPABASE] Résultat recherche:', user ? 'TROUVÉ id=' + user.id : 'AUCUN');
  return user;
}

/**
 * Crée ou met à jour les credentials Google d'un utilisateur
 */
async function setGoogleCredentials(cademoEmail, googleEmail, googlePassword) {
  const cleanEmail = (cademoEmail || '').toLowerCase().trim();
  const { data: existing, error: findError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', cleanEmail)
    .limit(1);

  if (findError) {
    console.error('[SUPABASE] Erreur recherche existant:', findError);
  }

  const row = (existing && existing[0]) || null;

  if (row) {
    console.log('[SUPABASE] Mise à jour credentials pour id:', row.id);
    const { error } = await supabase
      .from('users')
      .update({ email: cleanEmail, google_email: googleEmail, google_password: googlePassword, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) { console.error('[SUPABASE] Erreur update credentials:', error); return false; }
    return true;
  } else {
    console.log('[SUPABASE] Création nouveau user:', cleanEmail);
    const { error } = await supabase
      .from('users')
      .insert({ email: cleanEmail, google_email: googleEmail, google_password: googlePassword, status: 'pending_validation', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) { console.error('[SUPABASE] Erreur insert user:', error); return false; }
    return true;
  }
}

/* ================================================================
   AFFILIATION — helpers pour le système de parrainage
   ================================================================ */

async function generateUniqueShortId() {
  let attempts = 0;
  while (attempts < 100) {
    const id = '#' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const { data } = await supabase.from('users').select('short_id').eq('short_id', id).limit(1);
    if (!data || !data[0]) return id;
    attempts++;
  }
  throw new Error('Impossible de générer un short_id unique');
}

async function generateUniqueAffiliateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclut I,1,O,0 pour éviter la confusion
  let attempts = 0;
  while (attempts < 100) {
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    const code = 'CADEMO-' + suffix;
    const { data } = await supabase.from('users').select('affiliate_code').eq('affiliate_code', code).limit(1);
    if (!data || !data[0]) return code;
    attempts++;
  }
  throw new Error('Impossible de générer un code de parrainage unique');
}

async function setupAffiliateProfile(authUserId, email, referralCode = null) {
  const { data: existingRows } = await supabase.from('users').select('*').eq('id', authUserId).limit(1);
  const existing = (existingRows && existingRows[0]) || null;
  if (existing && existing.short_id && existing.affiliate_code) return { user: existing, isNew: false };

  const shortId = (existing && existing.short_id) ? existing.short_id : await generateUniqueShortId();
  const affiliateCode = (existing && existing.affiliate_code) ? existing.affiliate_code : await generateUniqueAffiliateCode();

  if (existing) {
    const updates = {
      short_id: shortId,
      affiliate_code: affiliateCode,
      role: 'partner',
      updated_at: new Date().toISOString()
    };
    if (referralCode && !existing.referred_by) updates.referred_by = referralCode;
    const { data, error } = await supabase.from('users').update(updates).eq('id', authUserId).select().single();
    if (error) throw error;
    return { user: data, isNew: false };
  } else {
    const insert = {
      id: authUserId,
      email: email.toLowerCase().trim(),
      short_id: shortId,
      affiliate_code: affiliateCode,
      role: 'partner',
      status: 'pending_validation',
      referred_by: referralCode || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('users').insert(insert).select().single();
    if (error) throw error;
    return { user: data, isNew: true };
  }
}

async function setupPlayerProfile(authUserId, email, googleEmail = null, googlePassword = null, referralCode = null) {
  const { data: existingRows } = await supabase.from('users').select('*').eq('id', authUserId).limit(1);
  const existing = (existingRows && existingRows[0]) || null;
  if (existing && existing.short_id) {
    if (referralCode && !existing.referred_by) {
      await supabase.from('users').update({ referred_by: referralCode }).eq('id', authUserId);
      await linkReferralByCode(authUserId, referralCode);
    }
    return { user: { ...existing, referred_by: existing.referred_by || referralCode }, isNew: false };
  }
  const shortId = await generateUniqueShortId();
  if (existing) {
    const updates = { short_id: shortId, role: 'player', updated_at: new Date().toISOString() };
    if (googleEmail) updates.google_email = googleEmail;
    if (googlePassword) updates.google_password = googlePassword;
    if (referralCode) updates.referred_by = referralCode;
    const { data, error } = await supabase.from('users').update(updates).eq('id', authUserId).select().single();
    if (error) throw error;
    if (referralCode) await linkReferralByCode(authUserId, referralCode);
    return { user: data, isNew: false };
  } else {
    const insert = {
      id: authUserId,
      email: email.toLowerCase().trim(),
      short_id: shortId,
      role: 'player',
      status: 'pending_validation',
      google_email: googleEmail || null,
      google_password: googlePassword || null,
      referred_by: referralCode || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('users').insert(insert).select().single();
    if (error) throw error;
    if (referralCode) await linkReferralByCode(data.id, referralCode);
    return { user: data, isNew: true };
  }
}

async function linkReferralByCode(playerId, code) {
  let { data: affRows, error: affErr } = await supabase.from('users').select('id').eq('affiliate_code', code).limit(1);
  let affiliate = (affRows && affRows[0]) || null;
  if (!affiliate) {
    ({ data: affRows, error: affErr } = await supabase.from('users').select('id').eq('short_id', code).limit(1));
    affiliate = (affRows && affRows[0]) || null;
  }
  if (affErr) {
    console.error('[linkReferralByCode] Erreur recherche affilié :', affErr);
    return { error: affErr.message };
  }
  if (!affiliate) {
    return { error: 'Code affilié introuvable.' };
  }

  // Vérifie si le lien existe déjà pour éviter les doublons
  const { data: existingLinkRows, error: existingErr } = await supabase.from('referrals')
    .select('id')
    .eq('affiliate_id', affiliate.id)
    .eq('referred_user_id', playerId)
    .limit(1);

  const existingLink = (existingLinkRows && existingLinkRows[0]) || null;

  if (existingErr) {
    console.error('[linkReferralByCode] Erreur vérification existant :', existingErr);
    return { error: existingErr.message };
  }

  if (!existingLink) {
    const { error: insertErr } = await supabase.from('referrals').insert({
      affiliate_id: affiliate.id,
      referred_user_id: playerId,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    if (insertErr) {
      console.error('[linkReferralByCode] Erreur insertion referral :', insertErr);
      return { error: insertErr.message };
    }

    // Incrémente total_referrals seulement si insertion réussie
    const { data: affRows2 } = await supabase.from('users').select('total_referrals').eq('id', affiliate.id).limit(1);
    const aff = (affRows2 && affRows2[0]) || null;
    if (aff) {
      const { error: updErr } = await supabase.from('users')
        .update({ total_referrals: (aff.total_referrals || 0) + 1 })
        .eq('id', affiliate.id);
      if (updErr) {
        console.error('[linkReferralByCode] Erreur incrément total_referrals :', updErr);
      }
    }
  }

  return { success: true, affiliateId: affiliate.id };
}



async function findPlayerByShortId(shortId) {
  const { data, error } = await supabase.from('users')
    .select('id, email, short_id, is_verified, bonus_activated, referred_by, role, balance, bonus_amount_locked, wager_multiplier, wager_required, wager_progress, wager_completed, bonus_activated_at, bonus_activated_by')
    .eq('short_id', shortId)
    .limit(1);
  if (error) return null;
  return (data && data[0]) || null;
}

async function activatePlayerBonus(playerShortId, activatingUserId) {
  const { data: playerRows } = await supabase.from('users').select('*').eq('short_id', playerShortId).limit(1);
  const player = (playerRows && playerRows[0]) || null;
  if (!player) return { success: false, reason: 'Joueur introuvable' };
  if (player.role === 'partner') return { success: false, reason: 'Compte non éligible' };
  if (!player.is_verified) return { success: false, reason: 'Compte non vérifié' };
  if (player.bonus_activated) return { success: false, reason: 'Bonus déjà activé' };

  // Déterminer le VRAI affilié : si le joueur a un referred_by,
  // on cherche l'affilié correspondant pour ne pas l'écraser par l'admin qui active.
  let realAffiliateId = activatingUserId;
  if (player.referred_by) {
    let { data: affRows } = await supabase.from('users').select('id').eq('affiliate_code', player.referred_by).limit(1);
    let realAffiliate = (affRows && affRows[0]) || null;
    if (!realAffiliate) {
      ({ data: affRows } = await supabase.from('users').select('id').eq('short_id', player.referred_by).limit(1));
      realAffiliate = (affRows && affRows[0]) || null;
    }
    if (realAffiliate) {
      realAffiliateId = realAffiliate.id;
    }
  }

  const newBalance = (player.balance || 0) + 200;
  await supabase.from('users').update({
    balance: newBalance,
    bonus_activated: true,
    bonus_activated_at: new Date().toISOString(),
    bonus_activated_by: activatingUserId,
    bonus_amount_locked: 200,
    wager_multiplier: 50,
    wager_required: 2000,
    wager_progress: 0,
    wager_completed: false
  }).eq('id', player.id);

  // Met à jour ou crée le lien dans referrals avec le VRAI affilié
  const { data: existingRefRows, error: refCheckErr } = await supabase.from('referrals')
    .select('id')
    .eq('affiliate_id', realAffiliateId)
    .eq('referred_user_id', player.id)
    .limit(1);

  const existingRef = (existingRefRows && existingRefRows[0]) || null;

  if (refCheckErr) {
    console.error('[activatePlayerBonus] Erreur vérification referral :', refCheckErr);
    return { success: false, reason: 'Erreur vérification referral : ' + refCheckErr.message };
  }

  if (!existingRef) {
    const { error: insErr } = await supabase.from('referrals').insert({
      affiliate_id: realAffiliateId,
      referred_user_id: player.id,
      status: 'bonus_activated',
      bonus_activated_at: new Date().toISOString()
    });
    if (insErr) {
      console.error('[activatePlayerBonus] Erreur insertion referral :', insErr);
      return { success: false, reason: 'Erreur insertion referral : ' + insErr.message };
    }
  } else {
    const { error: updErr } = await supabase.from('referrals')
      .update({ status: 'bonus_activated', bonus_activated_at: new Date().toISOString() })
      .eq('id', existingRef.id);
    if (updErr) {
      console.error('[activatePlayerBonus] Erreur mise à jour referral :', updErr);
      return { success: false, reason: 'Erreur mise à jour referral : ' + updErr.message };
    }
  }

  const { data: affiliate } = await supabase.from('users').select('*').eq('id', realAffiliateId).single();
  const newVerified = (affiliate.verified_referrals || 0) + 1;
  const newTotal = Math.max(newVerified, affiliate.total_referrals || 0);
  let tierTriggered = false;

  if (newVerified % 30 === 0) {
    tierTriggered = true;
    await supabase.from('affiliate_commissions').insert({
      affiliate_id: realAffiliateId,
      amount: 50,
      reason: 'tier_bonus_30',
      referral_count_at_trigger: newVerified
    });
  }

  await supabase.from('users').update({
    verified_referrals: newVerified,
    total_referrals: newTotal,
    total_commissions: (affiliate.total_commissions || 0) + (tierTriggered ? 50 : 0),
    updated_at: new Date().toISOString()
  }).eq('id', realAffiliateId);

  return { success: true, playerNewBalance: newBalance, tierTriggered, verifiedReferrals: newVerified };
}

async function getAffiliateStats(affiliateId) {
  const { data: affiliate } = await supabase.from('users').select('*').eq('id', affiliateId).single();
  if (!affiliate) return null;
  const { count: totalCount } = await supabase.from('referrals').select('*', { count: 'exact', head: true }).eq('affiliate_id', affiliateId);
  const { count: verifiedCount } = await supabase.from('referrals').select('*', { count: 'exact', head: true }).eq('affiliate_id', affiliateId).eq('status', 'bonus_activated');
  const { count: pendingCount } = await supabase.from('referrals').select('*', { count: 'exact', head: true }).eq('affiliate_id', affiliateId).eq('status', 'pending');
  const { data: commissions } = await supabase.from('affiliate_commissions').select('amount').eq('affiliate_id', affiliateId);
  const totalEarnings = (commissions || []).reduce((sum, c) => sum + (c.amount || 0), 0);

  // Recalcule et synchronise les compteurs de l'affilié (réparation auto)
  await supabase.from('users').update({
    total_referrals: totalCount || 0,
    verified_referrals: verifiedCount || 0,
    updated_at: new Date().toISOString()
  }).eq('id', affiliateId);

  return {
    totalReferrals: totalCount || 0,
    verifiedReferrals: verifiedCount || 0,
    pendingReferrals: pendingCount || 0,
    totalEarnings,
    nextTierProgress: (verifiedCount || 0) % 30,
    nextTierTarget: 30,
    nextTierReward: 50,
    affiliateCode: affiliate.affiliate_code,
    shortId: affiliate.short_id
  };
}

async function getAffiliateReferrals(affiliateId) {
  const { data, error } = await supabase.from('referrals')
    .select('id, status, created_at, bonus_activated_at, referred_user_id, users!referrals_referred_user_id_fkey(short_id, email)')
    .eq('affiliate_id', affiliateId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map(r => ({
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    bonusActivatedAt: r.bonus_activated_at,
    playerShortId: r.users?.short_id || 'N/A',
    playerEmail: r.users?.email || 'N/A'
  }));
}


module.exports = {
  supabase,
  getUserCredentials,
  getUserByEmail,
  setGoogleCredentials,
  updateUserStatus,
  getPendingUsers,
  getActiveSessions,
  setupAffiliateProfile,
  setupPlayerProfile,
  findPlayerByShortId,
  activatePlayerBonus,
  getAffiliateStats,
  getAffiliateReferrals,
  generateUniqueShortId,
  generateUniqueAffiliateCode,
  linkReferralByCode
};