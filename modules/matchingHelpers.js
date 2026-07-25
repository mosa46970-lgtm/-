function hasVerifiedTeachSkill(user) {
  const verified = user?.verifiedSkills || [];
  const teach = user?.teachSkills || [];
  return teach.some((s) => verified.includes(s));
}

function isBidirectionalMatch(currentUser, candidate) {
  const canTeachMe = (candidate.teachSkills || []).some((s) =>
    (currentUser.learnSkills || []).includes(s)
  );
  const canLearnFrom = (candidate.learnSkills || []).some((s) =>
    (currentUser.teachSkills || []).includes(s)
  );
  return canTeachMe && canLearnFrom;
}

function calcMatchScore(currentUser, user) {
  const uVerified = user.verifiedSkills || [];
  const myVerified = currentUser.verifiedSkills || [];
  const learnM = user.teachSkills.filter((s) => currentUser.learnSkills.includes(s)).length;
  const teachM = user.learnSkills.filter((s) => currentUser.teachSkills.includes(s)).length;
  const learnMV = user.teachSkills.filter(
    (s) => currentUser.learnSkills.includes(s) && uVerified.includes(s)
  ).length;
  const teachMV = user.learnSkills.filter(
    (s) => currentUser.teachSkills.includes(s) && myVerified.includes(s)
  ).length;
  const total = currentUser.learnSkills.length + currentUser.teachSkills.length || 1;
  let score = Math.min(
    100,
    Math.round(((learnM + teachM + learnMV + teachMV) / (total * 2)) * 100) ||
      Math.round(((learnM + teachM) / total) * 100)
  );

  const myLangs = currentUser.languages || [];
  const theirLangs = user.languages || [];
  if (myLangs.length && theirLangs.some((l) => myLangs.includes(l))) score = Math.min(100, score + 4);
  if (currentUser.country && user.country && currentUser.country === user.country) {
    score = Math.min(100, score + 3);
  }
  if ((user.reviews || []).length >= 3) score = Math.min(100, score + 2);
  return score;
}

function explainMatch(currentUser, user) {
  const theyTeachYou = (user.teachSkills || []).filter((s) =>
    (currentUser.learnSkills || []).includes(s)
  );
  const youTeachThem = (user.learnSkills || []).filter((s) =>
    (currentUser.teachSkills || []).includes(s)
  );
  const sharedInterests = [
    ...new Set([...(user.teachSkills || []), ...(user.learnSkills || [])]),
  ].filter((s) =>
    [...(currentUser.teachSkills || []), ...(currentUser.learnSkills || [])].includes(s)
  );
  const sharedLanguages = (user.languages || []).filter((l) =>
    (currentUser.languages || []).includes(l)
  );
  const reasons = [];
  if (theyTeachYou.length) {
    reasons.push(`يعلّم ما تريد تعلمه: ${theyTeachYou.slice(0, 3).join("، ")}`);
  }
  if (youTeachThem.length) {
    reasons.push(`يريد تعلم ما تتقنه: ${youTeachThem.slice(0, 3).join("، ")}`);
  }
  if ((user.verifiedSkills || []).some((s) => theyTeachYou.includes(s))) {
    reasons.push("مهاراته التعليمية موثّقة باختبار");
  }
  if (sharedLanguages.length) {
    reasons.push(`لغة مشتركة: ${sharedLanguages.join("، ")}`);
  }
  if (currentUser.country && user.country && currentUser.country === user.country) {
    reasons.push(`نفس الدولة: ${user.country}`);
  }
  if ((user.reviews || []).length) {
    const avg =
      user.reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0) / user.reviews.length;
    reasons.push(`تقييم ${avg.toFixed(1)} من ${user.reviews.length} مراجعة`);
  }

  return {
    theyTeachYou,
    youTeachThem,
    sharedInterests,
    sharedLanguages,
    reasons: reasons.length ? reasons : ["تبادل مهارات ثنائي الاتجاه"],
  };
}

module.exports = {
  hasVerifiedTeachSkill,
  isBidirectionalMatch,
  calcMatchScore,
  explainMatch,
};
