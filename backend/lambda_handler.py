import json
import traceback

try:
    from mangum import Mangum
    from app.main import app

    _handler = Mangum(app, lifespan="off")
except Exception as e:
    # If the app fails to start, return a useful error instead of crashing silently
    _startup_error = traceback.format_exc()
    print(f"APPLICATION STARTUP FAILED:\n{_startup_error}")

    def _handler(event, context):
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "detail": f"Application startup failed: {type(e).__name__}: {e}",
                "traceback": _startup_error,
            }),
        }


def handler(event, context):
    return _handler(event, context)
