"""Training auto-trigger threshold logic."""


def should_trigger_training(new_labels: int, threshold: int = 200, active_run: bool = False) -> bool:
    if active_run:
        return False
    return new_labels >= threshold
