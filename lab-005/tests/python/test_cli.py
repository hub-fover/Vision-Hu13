from defocus_depth.cli import build_parser


def test_cli_exposes_three_commands():
    parser = build_parser()
    assert parser.parse_args(["estimate", "stack", "--output", "depth.png"]).command == "estimate"
    assert parser.parse_args(["calibrate-intrinsics", "cal", "--pattern", "9x6", "--square-size", "0.02", "--output", "c.json"]).command == "calibrate-intrinsics"
