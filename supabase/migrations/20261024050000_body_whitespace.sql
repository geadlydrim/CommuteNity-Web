-- Bodies must be non-blank as the app's JS String.prototype.trim() sees it.
--
-- 20261024020000_content_limits.sql only stripped space, tab, CR and LF, so a
-- body made only of vertical tab, form feed, a non-breaking space or another
-- Unicode space passed the database check while the app treats it as blank.
-- Replace both constraints (same names) with a regex over the full set of
-- characters JS trim() removes: \t \n \v \f \r, space, U+00A0, U+1680,
-- U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF.
--
-- The characters are listed explicitly instead of using [[:space:]], whose
-- meaning depends on the database locale. The pattern is a plain
-- (standard-conforming) string literal, so the backslash escapes reach the
-- regex engine untouched and are read as ARE character-entry escapes.

ALTER TABLE public.posts DROP CONSTRAINT posts_body_not_blank;
ALTER TABLE public.posts ADD CONSTRAINT posts_body_not_blank
  CHECK (body !~ '^[ \t\n\v\f\r\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$');

ALTER TABLE public.comments DROP CONSTRAINT comments_body_not_blank;
ALTER TABLE public.comments ADD CONSTRAINT comments_body_not_blank
  CHECK (body !~ '^[ \t\n\v\f\r\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$');
