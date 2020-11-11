// this is a concession i made for rollup since it doesn't seem to be able to
// transpile typescript *and* roll everything into a single file. since we don't
// ever add spigot tests i figured it would be ok. If we end up adding
// tests more often, maybe we can generate this file.
import './sdk-video-test';
import './sdk-softphone-test';
import './acd-screen-share-test';
