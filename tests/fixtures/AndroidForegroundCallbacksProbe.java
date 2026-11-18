package com.sightline.v3;

public final class AndroidForegroundCallbacksProbe {
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        MainActivity.ForegroundCallbacks lifecycle = new MainActivity.ForegroundCallbacks();
        StringBuilder shown = new StringBuilder();
        int[] generation = {1};
        lifecycle.run(() -> {
            if (generation[0] == 1) shown.append("stale join");
        });
        generation[0]++;
        lifecycle.run(() -> shown.append("ready"));
        check(shown.length() == 0, "worker completion must wait for the foreground");
        lifecycle.resume();
        lifecycle.resume();
        check(shown.toString().equals("ready"), "resume runs the current result once");

        lifecycle.pause();
        lifecycle.run(() -> {
            shown.append(" recovery");
            lifecycle.pause();
        });
        lifecycle.run(() -> shown.append(" next"));
        lifecycle.resume();
        check(shown.toString().equals("ready recovery"), "pause interrupts queue draining");
        lifecycle.resume();
        check(shown.toString().equals("ready recovery next"), "next resume drains the remainder");

        lifecycle.pause();
        lifecycle.run(() -> shown.append(" retired activity"));
        lifecycle.close();
        lifecycle.resume();
        lifecycle.run(() -> shown.append(" late completion"));
        check(shown.toString().equals("ready recovery next"), "destroy drops pending and later callbacks");
        System.out.println("PASS: foreground handoff, stale generation, repeated resume, pause and destroy");
    }
}
