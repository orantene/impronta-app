/**
 * Loader for the dock skin-parity suite. Lives outside `t/[profileCode]/`
 * because `node --test` treats square brackets as a character-class glob and
 * silently finds 0 files when the suite path is passed directly.
 */
import "../../app/t/[profileCode]/_chat/skin-parity.render.test.tsx";
