#include <jni.h>
#include <vector>
#include <string>
#include <memory>
#include <cstdlib>
#include <unistd.h>
#include "node.h"
// JNI is invoked on the dedicated host-service process worker thread, never the UI thread.
extern "C" JNIEXPORT jint JNICALL Java_com_sightline_v3_LanHostService_runNode(
    JNIEnv* env, jobject, jobjectArray arguments, jstring jhome, jstring jtemp) {
  if (!arguments || !jhome || !jtemp) return -1;
  const char* home = env->GetStringUTFChars(jhome, nullptr);
  if (!home) return -5;
  const char* temp = env->GetStringUTFChars(jtemp, nullptr);
  if (!temp) { env->ReleaseStringUTFChars(jhome,home); return -5; }
  // Node/libuv may require writable HOME/TMPDIR even when the script uses __dirname.
  const bool pathsOk = home[0] == '/' && temp[0] == '/' &&
      setenv("HOME", home, 1) == 0 && setenv("TMPDIR", temp, 1) == 0;
  env->ReleaseStringUTFChars(jhome, home);
  env->ReleaseStringUTFChars(jtemp, temp);
  if (!pathsOk) return -6;
  unsetenv("NODE_OPTIONS");
  const jsize n = env->GetArrayLength(arguments);
  if (n < 2 || n > 24) return -2;
  std::vector<std::string> args;
  args.reserve(n);
  for (jsize i=0;i<n;++i) {
    auto s = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
    if (!s) return -3;
    const char* utf = env->GetStringUTFChars(s, nullptr);
    if (!utf) { env->DeleteLocalRef(s); return -4; }
    args.emplace_back(utf);
    env->ReleaseStringUTFChars(s, utf);
    env->DeleteLocalRef(s);
  }
  std::vector<char*> argv;
  argv.reserve(args.size());
  for (auto& s : args) argv.push_back(s.data());
  return node::Start(static_cast<int>(argv.size()), argv.data());
}
